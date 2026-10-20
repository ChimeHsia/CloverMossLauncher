import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { utilityProcess, type UtilityProcess } from 'electron'
import type { BackendInfo } from '@shared/backend'
import type { JobRecord } from '@shared/types'
import { onEmit } from '../lib/events'
import { cancelJob, getJob, listJobs, startJob } from './supervisor'
import { getCatalog } from './models'
import { listGallery } from './gallery'
import { listInstances } from './instances'
import { deleteProject, getProject, listProjects, saveProject } from './projects'
import { getSettings } from './settings'

let child: UtilityProcess | null = null
let info: BackendInfo = { ready: false, url: null, token: null }
let unsubscribe: (() => void) | null = null

function handleRpc(message: Record<string, unknown>): void {
  const id = String(message['id'] ?? '')
  const method = String(message['method'] ?? '')
  const params = (message['params'] ?? {}) as Record<string, unknown>
  const respond = (result: unknown, error?: string): void => {
    try {
      child?.postMessage(error ? { type: 'rpc-result', id, error } : { type: 'rpc-result', id, result })
    } catch {
      // child gone
    }
  }
  void (async () => {
    try {
      if (method === 'startJob') {
        respond(await startJob(params as never))
      } else if (method === 'cancelJob') {
        respond(await cancelJob(String(params['id'] ?? '')))
      } else if (method === 'getJob') {
        respond(await getJob(String(params['id'] ?? '')))
      } else if (method === 'listJobs') {
        respond(await listJobs())
      } else if (method === 'listProjects') {
        respond(listProjects())
      } else if (method === 'getProject') {
        respond(getProject(String(params['id'] ?? '')))
      } else if (method === 'saveProject') {
        respond(saveProject(params as never))
      } else if (method === 'deleteProject') {
        deleteProject(String(params['id'] ?? ''))
        respond(true)
      } else if (method === 'listInstances') {
        respond(await listInstances())
      } else if (method === 'listModels') {
        respond(await getCatalog(getSettings()))
      } else if (method === 'listGallery') {
        respond(await listGallery(getSettings(), params as never))
      } else {
        respond(null, `unknown backend method: ${method}`)
      }
    } catch (error) {
      respond(null, error instanceof Error ? error.message : String(error))
    }
  })()
}

export async function startBackend(): Promise<BackendInfo> {
  const token = randomBytes(24).toString('hex')
  const ready = new Promise<BackendInfo>((resolve) => {
    const timer = setTimeout(() => resolve({ ready: false, url: null, token: null, error: 'backend startup timeout' }), 8000)
    try {
      child = utilityProcess.fork(join(__dirname, 'backend.js'), [], {
        env: { ...process.env, CLOVER_BACKEND_TOKEN: token },
        stdio: 'pipe',
      })
    } catch (error) {
      clearTimeout(timer)
      resolve({ ready: false, url: null, token: null, error: error instanceof Error ? error.message : String(error) })
      return
    }
    child.on('message', (message: unknown) => {
      const payload = message as Record<string, unknown>
      if (payload?.['type'] === 'ready') {
        clearTimeout(timer)
        const port = Number(payload['port'] ?? 0)
        resolve({ ready: true, url: `http://127.0.0.1:${port}`, token })
        return
      }
      if (payload?.['type'] === 'rpc') handleRpc(payload)
    })
    child.on('exit', (code) => {
      info = { ready: false, url: null, token: null, error: `backend exited (${code})` }
      if (!info.ready) {
        clearTimeout(timer)
        resolve(info)
      }
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      const line = chunk.toString().trim()
      if (line) console.error(`[backend] ${line}`)
    })
  })
  info = await ready
  if (info.ready) {
    unsubscribe = onEmit((channel, payload) => {
      try {
        child?.postMessage({ type: 'event', channel, payload })
      } catch {
        // child gone
      }
    })
    console.log(`[backend] ${info.url}`)
  } else if (info.error) {
    console.error(`[backend] ${info.error}`)
  }
  return info
}

export function getBackendInfo(): BackendInfo {
  return info
}

export function stopBackend(): void {
  unsubscribe?.()
  unsubscribe = null
  try {
    child?.kill()
  } catch {
    // ignore
  }
  child = null
  info = { ready: false, url: null, token: null }
}
