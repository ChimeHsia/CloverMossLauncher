import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Settings, TrainingHost } from '@shared/types'
import { paths } from '../lib/paths'
import { run } from '../lib/run'
import { probeHost } from './ssh'

const FILE = () => join(paths.root(), 'training-hosts.json')
let remote: TrainingHost[] | null = null

function load(): TrainingHost[] {
  if (remote) return remote
  try {
    if (!existsSync(FILE())) {
      remote = []
      return remote
    }
    const parsed = JSON.parse(readFileSync(FILE(), 'utf8')) as TrainingHost[]
    remote = Array.isArray(parsed) ? parsed : []
  } catch {
    remote = []
  }
  return remote
}

function persist(): void {
  try {
    writeFileSync(FILE(), JSON.stringify(load(), null, 2), 'utf8')
  } catch {
    // best effort
  }
}

export function listTrainingHosts(settings: Settings): TrainingHost[] {
  const local: TrainingHost = {
    id: 'local',
    name: '本机',
    kind: 'local',
    trainerRoot: paths.trainerRoot(settings.trainerRoot),
    status: 'unchecked',
  }
  return [local, ...load()]
}

export interface SaveTrainingHostInput {
  id?: string
  name: string
  host: string
  user: string
  port?: number
  identityFile?: string
  trainerRoot: string
}

export function saveTrainingHost(input: SaveTrainingHostInput): TrainingHost {
  const hosts = load()
  const existing = input.id ? hosts.find((host) => host.id === input.id) : undefined
  const next: TrainingHost = {
    id: existing?.id ?? `ssh-${randomUUID().slice(0, 8)}`,
    name: input.name.trim() || input.host,
    kind: 'ssh',
    host: input.host.trim(),
    user: input.user.trim(),
    port: input.port ?? 22,
    identityFile: input.identityFile?.trim() || undefined,
    trainerRoot: input.trainerRoot.trim(),
    status: 'unchecked',
    lastCheckedAt: undefined,
  }
  if (existing) Object.assign(existing, next)
  else remote = [...hosts, next]
  persist()
  return next
}

export function getTrainingHost(settings: Settings, id: string): TrainingHost | undefined {
  return listTrainingHosts(settings).find((host) => host.id === id)
}

export async function testTrainingHost(settings: Settings, id: string): Promise<TrainingHost> {
  const host = getTrainingHost(settings, id)
  if (!host) throw new Error('训练主机不存在')
  if (host.kind === 'local') {
    const cuda = await run('nvidia-smi', ['-L'], { timeoutMs: 8000 })
    return {
      ...host,
      status: cuda.code === 0 ? 'ok' : 'error',
      lastCheckedAt: new Date().toISOString(),
      error: cuda.code === 0 ? undefined : '本机没有 NVIDIA CUDA；KohakuMossTrainer 不支持 MPS',
    }
  }
  try {
    const probe = await probeHost(host)
    Object.assign(host, {
      status: 'ok',
      lastCheckedAt: new Date().toISOString(),
      error: undefined,
      remote: {
        os: probe.os,
        gpu: probe.gpu,
        git: probe.git,
        uv: probe.uv,
        python: probe.python,
        rootReady: probe.rootReady,
      },
    })
  } catch (error) {
    Object.assign(host, {
      status: 'error',
      lastCheckedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message.slice(0, 2000) : String(error),
    })
  }
  persist()
  return { ...host }
}

export function updateTrainingHostVersions(settings: Settings, id: string, versions: TrainingHost['versions']): void {
  const hosts = load()
  const host = hosts.find((item) => item.id === id)
  if (!host) return
  host.versions = versions
  persist()
}

export function removeTrainingHost(id: string): void {
  remote = load().filter((host) => host.id !== id)
  persist()
}
