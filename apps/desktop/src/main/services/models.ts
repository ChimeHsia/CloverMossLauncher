import { createHash } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, rename, rm, stat, statfs, symlink, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative } from 'node:path'
import type { AdapterEntry, Catalog, DownloadTask, ModelEntry, Settings } from '@shared/types'
import { Events } from '@shared/channels'
import { emit } from '../lib/events'
import { paths } from '../lib/paths'
import { getLastNetwork } from './network'
import { localReleaseDir } from './updates'

interface RawModel {
  id: string
  name: string
  provider: 'hf'
  repo: string
  revision?: string
  role: ModelEntry['role']
  precision: string
  size_bytes?: number
  license: string
  tags?: string[]
  notes?: string
  preview?: string
}

interface RawAdapter {
  id: string
  name: string
  provider: 'hf'
  repo: string
  revision?: string
  kind: AdapterEntry['kind']
  base?: string
  license: string
  files: string[]
  size_bytes?: number
  requires_profile?: string
  tags?: string[]
  notes?: string
}

interface LocalAdapterRecord {
  id: string
  name: string
  path: string
  kind: AdapterEntry['kind']
  base?: string
  license: string
  files: string[]
  sizeBytes: number
  createdAt: string
}

interface LocalAdapterIndex {
  schema_version: 1
  adapters: LocalAdapterRecord[]
}

interface RawCatalog {
  schema_version: number
  updated_at?: string
  models: RawModel[]
  adapters?: RawAdapter[]
}

const BUILTIN: RawCatalog = {
  schema_version: 1,
  models: [
    {
      id: 'moss-sft',
      name: 'MOSS-Image SFT',
      provider: 'hf',
      repo: 'OpenMOSS-Team/MOSS-Image-SFT',
      role: 'full',
      precision: 'bf16',
      size_bytes: 27_200_000_000,
      license: 'Apache-2.0',
      tags: ['official', 'sft'],
    },
  ],
  adapters: [],
}

let catalogCache: Catalog | null = null

function localAdapterFile(settings: Settings): string {
  return join(paths.adapters(settings.modelsRoot), 'index.json')
}

async function readLocalAdapters(settings: Settings): Promise<LocalAdapterRecord[]> {
  try {
    const raw = JSON.parse(await readFile(localAdapterFile(settings), 'utf8')) as LocalAdapterIndex
    return Array.isArray(raw.adapters) ? raw.adapters : []
  } catch {
    return []
  }
}

export async function registerTrainedAdapter(
  settings: Settings,
  input: { id: string; name: string; sourcePath: string; kind?: AdapterEntry['kind']; base?: string; license?: string },
): Promise<AdapterEntry> {
  const id = input.id.replace(/[^A-Za-z0-9._-]/g, '-')
  const destDir = join(paths.adapters(settings.modelsRoot), id)
  await mkdir(destDir, { recursive: true })
  const file = basename(input.sourcePath)
  await copyFile(input.sourcePath, join(destDir, file))
  const info = await stat(join(destDir, file))
  const record: LocalAdapterRecord = {
    id,
    name: input.name || id,
    path: destDir,
    kind: input.kind ?? 'lora',
    base: input.base,
    license: input.license ?? 'local',
    files: [file],
    sizeBytes: info.size,
    createdAt: new Date().toISOString(),
  }
  const existing = (await readLocalAdapters(settings)).filter((item) => item.id !== id)
  await writeFile(localAdapterFile(settings), JSON.stringify({ schema_version: 1, adapters: [...existing, record] }, null, 2), 'utf8')
  invalidateCatalog()
  return {
    id,
    name: record.name,
    provider: 'local',
    repo: record.path,
    revision: 'local',
    kind: record.kind,
    base: record.base,
    license: record.license,
    files: record.files,
    sizeBytes: record.sizeBytes,
    tags: ['trained'],
    notes: '由 Kohaku Trainer 产物登记',
    installed: true,
    installedBytes: record.sizeBytes,
  }
}

async function fetchText(url: string, timeoutMs = 8000): Promise<string> {
  const response = await fetch(url, {
    headers: { 'user-agent': 'CloverMoss-Launcher/0.1' },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return await response.text()
}

function dirSize(dir: string): Promise<number> {
  return readdir(dir, { withFileTypes: true })
    .then(async (entries) => {
      let total = 0
      for (const entry of entries) {
        const full = join(dir, entry.name)
        try {
          if (entry.isDirectory()) total += await dirSize(full)
          else {
            const info = await stat(full)
            total += info.size
          }
        } catch {
          // ignore broken symlinks
        }
      }
      return total
    })
    .catch(() => 0)
}

async function installedRepos(settings: Settings): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  try {
    const entries = await readdir(paths.hub(settings.modelsRoot), { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith('models--')) continue
      const repo = entry.name.replace('models--', '').replace('--', '/')
      map.set(repo, await dirSize(join(paths.hub(settings.modelsRoot), entry.name)))
    }
  } catch {
    // none
  }
  return map
}

async function installedAdapters(settings: Settings): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  try {
    const entries = await readdir(paths.adapters(settings.modelsRoot), { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      map.set(entry.name, await dirSize(join(paths.adapters(settings.modelsRoot), entry.name)))
    }
  } catch {
    // none
  }
  return map
}

export async function getCatalog(settings: Settings, force = false): Promise<Catalog> {
  if (catalogCache && !force) return catalogCache

  let raw = BUILTIN
  let source: Catalog['source'] = 'builtin'
  const local = localReleaseDir()
  if (local && existsSync(join(local, 'models.json'))) {
    try {
      raw = JSON.parse(await readFile(join(local, 'models.json'), 'utf8')) as RawCatalog
      source = 'local'
    } catch {
      raw = BUILTIN
    }
  } else {
    const base = getLastNetwork()?.selected.manifest ?? 'https://raw.githubusercontent.com/CloverIris/CloverMossLauncher/main'
    try {
      raw = JSON.parse(await fetchText(`${base.replace(/\/$/, '')}/release/models.json`)) as RawCatalog
      source = 'remote'
    } catch {
      raw = BUILTIN
    }
  }

  const modelsInstalled = await installedRepos(settings)
  const adaptersInstalled = await installedAdapters(settings)

  const models: ModelEntry[] = raw.models.map((model) => {
    const installedBytes = modelsInstalled.get(model.repo) ?? 0
    return {
      id: model.id,
      name: model.name,
      provider: model.provider,
      repo: model.repo,
      revision: model.revision ?? 'main',
      role: model.role,
      precision: model.precision,
      sizeBytes: model.size_bytes ?? 0,
      license: model.license,
      tags: model.tags ?? [],
      notes: model.notes,
      preview: model.preview,
      installed: installedBytes > 0,
      installedBytes,
    }
  })

  const localAdapters = await readLocalAdapters(settings)
  const adapters: AdapterEntry[] = (raw.adapters ?? []).map((adapter) => {
    const installedBytes = adaptersInstalled.get(adapter.id) ?? 0
    return {
      id: adapter.id,
      name: adapter.name,
      provider: adapter.provider,
      repo: adapter.repo,
      revision: adapter.revision ?? 'main',
      kind: adapter.kind,
      base: adapter.base,
      license: adapter.license,
      files: adapter.files,
      sizeBytes: adapter.size_bytes ?? 0,
      requiresProfile: adapter.requires_profile,
      tags: adapter.tags ?? [],
      notes: adapter.notes,
      installed: installedBytes > 0,
      installedBytes,
    }
  })

  for (const local of localAdapters) {
    adapters.push({
      id: local.id,
      name: local.name,
      provider: 'local',
      repo: local.path,
      revision: 'local',
      kind: local.kind,
      base: local.base,
      license: local.license,
      files: local.files,
      sizeBytes: local.sizeBytes,
      tags: ['trained'],
      notes: '由 Kohaku Trainer 产物登记',
      installed: true,
      installedBytes: local.sizeBytes,
    })
  }

  catalogCache = {
    updatedAt: raw.updated_at ?? new Date().toISOString(),
    models,
    adapters,
    source,
  }
  return catalogCache
}

export function invalidateCatalog(): void {
  catalogCache = null
}

const tasks = new Map<string, DownloadTask>()
const controllers = new Map<string, AbortController>()

export function listDownloads(): DownloadTask[] {
  return [...tasks.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

function touch(task: DownloadTask, patch: Partial<DownloadTask>): void {
  Object.assign(task, patch, { updatedAt: new Date().toISOString() })
  emit(Events.download, { ...task })
}

function endpoint(settings: Settings): string {
  return (settings.hfEndpoint ?? getLastNetwork()?.selected.hf ?? 'https://huggingface.co').replace(/\/$/, '')
}

interface HfFile {
  path: string
  size: number
  oid: string | null
}

async function resolveRepo(repo: string, revision: string, settings: Settings): Promise<{ sha: string; files: HfFile[] }> {
  const base = endpoint(settings)
  const meta = JSON.parse(await fetchText(`${base}/api/models/${repo}`, 30_000)) as { sha?: string }
  const sha = meta.sha ?? revision
  const tree = JSON.parse(await fetchText(`${base}/api/models/${repo}/tree/${sha}?recursive=true`, 30_000)) as Array<{
    type: string
    path: string
    size?: number
    oid?: string
    lfs?: { oid?: string }
  }>
  const files = tree
    .filter((item) => item.type === 'file')
    .map((item) => ({
      path: item.path,
      size: item.size ?? 0,
      oid: item.lfs?.oid ?? item.oid ?? null,
    }))
  return { sha, files }
}

async function freeSpace(target: string): Promise<number> {
  try {
    const info = await statfs(target)
    return Number(info.bavail) * Number(info.bsize)
  } catch {
    return 0
  }
}

async function downloadFile(
  url: string,
  destination: string,
  expectedSize: number,
  task: DownloadTask,
  signal: AbortSignal,
  onBytes: (bytes: number) => void,
): Promise<void> {
  await mkdir(dirname(destination), { recursive: true })
  if (existsSync(destination)) {
    const info = await stat(destination)
    if (!expectedSize || info.size === expectedSize) {
      onBytes(info.size)
      return
    }
  }
  const part = `${destination}.part`
  let offset = 0
  try {
    offset = (await stat(part)).size
  } catch {
    offset = 0
  }
  if (expectedSize && offset >= expectedSize) {
    onBytes(offset)
    await rename(part, destination)
    return
  }

  const headers: Record<string, string> = { 'user-agent': 'CloverMoss-Launcher/0.1' }
  if (offset > 0) headers['range'] = `bytes=${offset}-`
  const response = await fetch(url, { headers, signal, redirect: 'follow' })
  if (!response.ok && response.status !== 206) throw new Error(`HTTP ${response.status}`)
  if (!response.body) throw new Error('响应为空')

  const { open } = await import('node:fs/promises')
  const handle = await open(part, offset > 0 ? 'a' : 'w')
  let written = offset
  try {
    const reader = response.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        await handle.write(value)
        written += value.byteLength
        onBytes(written)
      }
    }
  } finally {
    await handle.close()
  }
  onBytes(written)
  await rename(part, destination)
}

function hashFile(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(file)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

async function runModelDownload(task: DownloadTask, entry: ModelEntry, settings: Settings): Promise<void> {
  const { sha, files } = await resolveRepo(entry.repo, entry.revision, settings)
  const cacheDir = join(paths.hub(settings.modelsRoot), `models--${entry.repo.replace('/', '--')}`)
  const blobs = join(cacheDir, 'blobs')
  const snapshots = join(cacheDir, 'snapshots', sha)
  const total = files.reduce((sum, file) => sum + file.size, 0)

  const free = await freeSpace(paths.models(settings.modelsRoot))
  if (free > 0 && free < total * 1.05 + 1024 ** 3) {
    throw new Error(`磁盘空间不足：需要约 ${(total / 1024 ** 3).toFixed(1)} GB，剩余 ${(free / 1024 ** 3).toFixed(1)} GB`)
  }

  touch(task, { filesTotal: files.length, totalBytes: total, state: 'running' })

  let doneBytes = 0
  let lastEmit = 0
  const base = endpoint(settings)
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]!
    if (task.state === 'paused') return
    const blobName = file.oid ?? createHash('sha1').update(`${entry.repo}/${file.path}`).digest('hex')
    const blobPath = join(blobs, blobName)
    const target = join(snapshots, file.path)
    const url = `${base}/${entry.repo}/resolve/${sha}/${file.path}`

    touch(task, { currentFile: file.path, filesDone: index })
    await downloadFile(url, blobPath, file.size, task, controllers.get(task.id)!.signal, (bytes) => {
      const now = Date.now()
      if (now - lastEmit > 300) {
        lastEmit = now
        touch(task, { bytes: doneBytes + bytes, speedBps: 0 })
      }
    })

    if (file.oid && file.oid.length === 64) {
      const digest = await hashFile(blobPath)
      if (digest !== file.oid) {
        await unlink(blobPath).catch(() => undefined)
        throw new Error(`校验失败：${file.path}`)
      }
    }

    await mkdir(dirname(target), { recursive: true })
    if (existsSync(target)) await unlink(target).catch(() => undefined)
    await symlink(relative(dirname(target), blobPath), target)

    doneBytes += file.size
    touch(task, { bytes: doneBytes, filesDone: index + 1 })
  }

  await mkdir(join(cacheDir, 'refs'), { recursive: true })
  await writeFile(join(cacheDir, 'refs', 'main'), sha, 'utf8')
  invalidateCatalog()
  touch(task, { state: 'done', bytes: total, speedBps: 0, currentFile: undefined })
}

async function runAdapterDownload(task: DownloadTask, entry: AdapterEntry, settings: Settings): Promise<void> {
  const { sha, files } = await resolveRepo(entry.repo, entry.revision, settings)
  const wanted = new Set(entry.files)
  const selected = files.filter((file) => wanted.has(file.path))
  if (!selected.length) throw new Error('适配器文件不在仓库中')
  const total = selected.reduce((sum, file) => sum + file.size, 0)
  const dir = join(paths.adapters(settings.modelsRoot), entry.id)
  touch(task, { filesTotal: selected.length, totalBytes: total, state: 'running' })

  let doneBytes = 0
  const base = endpoint(settings)
  for (let index = 0; index < selected.length; index += 1) {
    const file = selected[index]!
    if (task.state === 'paused') return
    const target = join(dir, file.path)
    touch(task, { currentFile: file.path, filesDone: index })
    await downloadFile(
      `${base}/${entry.repo}/resolve/${sha}/${file.path}`,
      target,
      file.size,
      task,
      controllers.get(task.id)!.signal,
      (bytes) => touch(task, { bytes: doneBytes + bytes }),
    )
    if (file.oid && file.oid.length === 64) {
      const digest = await hashFile(target)
      if (digest !== file.oid) {
        await unlink(target).catch(() => undefined)
        throw new Error(`校验失败：${file.path}`)
      }
    }
    doneBytes += file.size
    touch(task, { bytes: doneBytes, filesDone: index + 1 })
  }

  await writeFile(join(dir, 'adapter.json'), JSON.stringify(entry, null, 2), 'utf8')
  invalidateCatalog()
  touch(task, { state: 'done', bytes: total, speedBps: 0, currentFile: undefined })
}

async function beginDownload(
  kind: 'model' | 'adapter',
  entry: ModelEntry | AdapterEntry,
  settings: Settings,
): Promise<DownloadTask> {
  const id = `${kind}:${entry.id}`
  const existing = tasks.get(id)
  if (existing && (existing.state === 'running' || existing.state === 'queued')) return existing

  const task: DownloadTask = {
    id,
    kind,
    targetId: entry.id,
    label: entry.name,
    state: 'queued',
    filesTotal: 0,
    filesDone: 0,
    bytes: existing?.state === 'paused' ? existing.bytes : 0,
    totalBytes: 0,
    speedBps: 0,
    updatedAt: new Date().toISOString(),
  }
  tasks.set(id, task)
  controllers.set(id, new AbortController())
  touch(task, {})

  void (async () => {
    try {
      if (kind === 'model') await runModelDownload(task, entry as ModelEntry, settings)
      else await runAdapterDownload(task, entry as AdapterEntry, settings)
    } catch (error) {
      if (task.state === 'paused') return
      touch(task, { state: 'error', error: error instanceof Error ? error.message : String(error) })
    } finally {
      controllers.delete(id)
    }
  })()

  return task
}

export async function startDownload(
  kind: 'model' | 'adapter',
  targetId: string,
  settings: Settings,
): Promise<DownloadTask> {
  const catalog = await getCatalog(settings)
  const entry =
    kind === 'model'
      ? catalog.models.find((model) => model.id === targetId)
      : catalog.adapters.find((adapter) => adapter.id === targetId)
  if (!entry) throw new Error('目录中没有该条目')
  return beginDownload(kind, entry, settings)
}

/** Used by the "add from Hugging Face repo" flow and by the download self-test. */
export async function downloadCustomModel(repo: string, settings: Settings): Promise<DownloadTask> {
  const entry: ModelEntry = {
    id: repo.replace(/[^a-z0-9._-]+/gi, '-').toLowerCase(),
    name: repo,
    provider: 'hf',
    repo,
    revision: 'main',
    role: 'full',
    precision: 'unknown',
    sizeBytes: 0,
    license: 'unknown',
    tags: ['custom'],
    installed: false,
    installedBytes: 0,
  }
  return beginDownload('model', entry, settings)
}

export function pauseDownload(taskId: string): void {
  const task = tasks.get(taskId)
  if (!task) return
  controllers.get(taskId)?.abort()
  controllers.delete(taskId)
  touch(task, { state: 'paused' })
}

export async function deleteModel(kind: 'model' | 'adapter', targetId: string, settings: Settings): Promise<void> {
  const catalog = await getCatalog(settings)
  const entry = kind === 'model' ? catalog.models.find((m) => m.id === targetId) : catalog.adapters.find((a) => a.id === targetId)
  if (!entry) return
  if (kind === 'model') {
    await rm(join(paths.hub(settings.modelsRoot), `models--${(entry as ModelEntry).repo.replace('/', '--')}`), {
      recursive: true,
      force: true,
    })
  } else {
    await rm(join(paths.adapters(settings.modelsRoot), targetId), { recursive: true, force: true })
  }
  invalidateCatalog()
}
