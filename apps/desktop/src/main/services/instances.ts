import { existsSync } from 'node:fs'
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { InstanceInfo, RuntimeInfo, Settings } from '@shared/types'
import { Events } from '@shared/channels'
import { emit } from '../lib/events'
import { paths } from '../lib/paths'
import {
  DEFAULT_SOURCE,
  branchStableSha,
  commitExists,
  createWorktree,
  ensureMirror,
  isDirty,
  listCommits,
  checkout,
  removeWorktree,
} from './git'
import { ensureRuntime, readRuntime } from './runtimes'
import { getRecommendedCommit } from './updates'

export interface InstanceRecord {
  schemaVersion: 1
  id: string
  name: string
  source: string
  branch: string
  commit: string
  shortCommit: string
  commitDate: string
  subject: string
  author: string
  channel: InstanceInfo['channel']
  runtimeId: string
  runtimeMode: InstanceInfo['runtimeMode']
  models: string[]
  adapters: string[]
  createdAt: string
  lastUsedAt: string | null
}

function recordFile(id: string): string {
  return join(paths.instance(id), 'instance.json')
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'instance'
}

async function readRecord(id: string): Promise<InstanceRecord | null> {
  try {
    return JSON.parse(await readFile(recordFile(id), 'utf8')) as InstanceRecord
  } catch {
    return null
  }
}

async function writeRecord(record: InstanceRecord): Promise<void> {
  await mkdir(paths.instance(record.id), { recursive: true })
  await writeFile(recordFile(record.id), JSON.stringify(record, null, 2), 'utf8')
}

function channelFor(branch: string, commit: string, mainSha: string | null): InstanceInfo['channel'] {
  const recommended = getRecommendedCommit()
  if (branch === 'main' && (commit === mainSha || (!!recommended && commit.startsWith(recommended)))) return 'stable'
  return branch === 'main' ? 'experimental' : 'custom'
}

async function toInfo(record: InstanceRecord): Promise<InstanceInfo> {
  const dir = paths.instance(record.id)
  const runtime = await readRuntime(record.runtimeId)
  const mainSha = await branchStableSha()
  const exists = existsSync(dir) && existsSync(join(dir, 'pyproject.toml'))
  const dirty = exists ? await isDirty(dir) : false
  return {
    id: record.id,
    name: record.name,
    source: record.source,
    branch: record.branch,
    commit: record.commit,
    shortCommit: record.shortCommit,
    commitDate: record.commitDate,
    subject: record.subject,
    author: record.author,
    channel: channelFor(record.branch, record.commit, mainSha),
    runtimeId: record.runtimeId,
    runtimeMode: record.runtimeMode,
    runtimeState: runtime?.state ?? 'missing',
    models: record.models,
    adapters: record.adapters,
    createdAt: record.createdAt,
    lastUsedAt: record.lastUsedAt,
    path: dir,
    dirty,
    status: !exists ? 'missing' : !runtime ? 'runtime-missing' : 'ok',
  }
}

export async function listInstances(): Promise<InstanceInfo[]> {
  try {
    const entries = await readdir(paths.instances(), { withFileTypes: true })
    const records: InstanceRecord[] = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const record = await readRecord(entry.name)
      if (record) records.push(record)
    }
    return Promise.all(records.map(toInfo))
  } catch {
    return []
  }
}

export async function getInstance(id: string): Promise<InstanceInfo | null> {
  const record = await readRecord(id)
  return record ? toInfo(record) : null
}

export interface CreateInstanceInput {
  branch: string
  commit: string
  name?: string
  runtimeMode: 'shared' | 'isolated'
  source?: string
}

export async function createInstance(input: CreateInstanceInput, settings: Settings): Promise<InstanceInfo> {
  const source = input.source ?? DEFAULT_SOURCE
  await ensureMirror(settings, source)
  if (!(await commitExists(input.commit))) throw new Error('该提交不在本地镜像中，请先刷新分支')

  const commits = await listCommits(input.branch, 100)
  const commit = commits.find((item) => item.sha === input.commit || item.sha.startsWith(input.commit))
  const sha = commit?.sha ?? input.commit
  const short = sha.slice(0, 7)
  const name = (input.name?.trim() || `moss-${input.branch}-${short}`).slice(0, 60)

  let id = slugify(name)
  let suffix = 1
  while (existsSync(paths.instance(id))) {
    suffix += 1
    id = `${slugify(name)}-${suffix}`
  }

  const destination = paths.instance(id)
  await mkdir(paths.instances(), { recursive: true })
  await createWorktree(sha, destination)

  const runtime = await ensureRuntime({
    instanceId: id,
    instanceDir: destination,
    mode: input.runtimeMode,
    settings,
  })

  const record: InstanceRecord = {
    schemaVersion: 1,
    id,
    name,
    source,
    branch: input.branch,
    commit: sha,
    shortCommit: short,
    commitDate: commit?.date ?? new Date().toISOString(),
    subject: commit?.subject ?? '',
    author: commit?.author ?? '',
    channel: channelFor(input.branch, sha, await branchStableSha()),
    runtimeId: runtime.id,
    runtimeMode: input.runtimeMode,
    models: [],
    adapters: [],
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  }
  await writeRecord(record)
  emit(Events.instancesChanged, { id })
  return toInfo(record)
}

export async function deleteInstance(id: string, keepOutputs: boolean): Promise<void> {
  const record = await readRecord(id)
  const dir = paths.instance(id)
  if (keepOutputs && existsSync(join(dir, 'outputs'))) {
    const backup = join(paths.root(), 'outputs-kept', id)
    await mkdir(backup, { recursive: true })
    await cp(join(dir, 'outputs'), backup, { recursive: true, force: true })
  }
  await removeWorktree(dir)
  if (record) {
    const runtime = await readRuntime(record.runtimeId)
    if (runtime) {
      runtime.instanceIds = runtime.instanceIds.filter((item) => item !== id)
      await writeFile(
        join(paths.runtime(runtime.id), 'runtime.json'),
        JSON.stringify(runtime, null, 2),
        'utf8',
      )
    }
  }
  await rm(dir, { recursive: true, force: true })
  emit(Events.instancesChanged, { id })
}

export async function updateInstance(id: string, commit: string): Promise<InstanceInfo> {
  const record = await readRecord(id)
  if (!record) throw new Error('实例不存在')
  await checkout(paths.instance(id), commit)
  const commits = await listCommits(record.branch, 100)
  const info = commits.find((item) => item.sha === commit || item.sha.startsWith(commit))
  record.commit = info?.sha ?? commit
  record.shortCommit = record.commit.slice(0, 7)
  record.commitDate = info?.date ?? new Date().toISOString()
  record.subject = info?.subject ?? ''
  record.author = info?.author ?? ''
  record.channel = channelFor(record.branch, record.commit, await branchStableSha())
  await writeRecord(record)
  emit(Events.instancesChanged, { id })
  return toInfo(record)
}

export async function isolateInstance(id: string, settings: Settings): Promise<RuntimeInfo> {
  const record = await readRecord(id)
  if (!record) throw new Error('实例不存在')
  const previous = await readRuntime(record.runtimeId)
  const runtime = await ensureRuntime({
    instanceId: id,
    instanceDir: paths.instance(id),
    mode: 'isolated',
    settings,
  })
  record.runtimeId = runtime.id
  record.runtimeMode = 'isolated'
  await writeRecord(record)
  if (previous) {
    previous.instanceIds = previous.instanceIds.filter((item) => item !== id)
    await writeFile(join(paths.runtime(previous.id), 'runtime.json'), JSON.stringify(previous, null, 2), 'utf8')
  }
  emit(Events.instancesChanged, { id })
  return runtime
}

export async function markUsed(id: string): Promise<void> {
  const record = await readRecord(id)
  if (!record) return
  record.lastUsedAt = new Date().toISOString()
  await writeRecord(record)
}
