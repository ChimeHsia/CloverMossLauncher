import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Settings, TrainerRuntimeInfo, TrainerRuntimeState, TrainerVersion } from '@shared/types'
import { paths } from '../lib/paths'
import { run } from '../lib/run'
import { hasUv, parseDepsFromPyproject, pickPython, venvPython } from './runtimes'
import {
  createTrainerWorktree,
  ensureTrainerMirror,
  isTrainerDirty,
  listTrainerCommits,
  removeTrainerWorktree,
  trainerCommitExists,
  trainerMirror,
  trainerRuntimeDir,
  trainerRuntimesDir,
  trainerTagSha,
  trainerVersionDir,
  trainerVersionsDir,
} from './trainerGit'

function versionFile(settings: Settings, id: string): string {
  return join(trainerVersionDir(settings, id), 'trainer.json')
}

function runtimeRoot(settings: Settings): string {
  return trainerRuntimesDir(settings)
}

function runtimeDir(settings: Settings, id: string): string {
  return trainerRuntimeDir(settings, id)
}

function runtimeFile(settings: Settings, id: string): string {
  return join(runtimeDir(settings, id), 'runtime.json')
}

function hash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 8)
}

async function readRuntime(settings: Settings, id: string): Promise<TrainerRuntimeInfo | null> {
  try {
    return JSON.parse(await readFile(runtimeFile(settings, id), 'utf8')) as TrainerRuntimeInfo
  } catch {
    return null
  }
}

async function writeRuntime(settings: Settings, runtime: TrainerRuntimeInfo): Promise<void> {
  await mkdir(runtimeDir(settings, runtime.id), { recursive: true })
  await writeFile(runtimeFile(settings, runtime.id), JSON.stringify(runtime, null, 2), 'utf8')
}

async function readVersion(settings: Settings, id: string): Promise<TrainerVersion | null> {
  try {
    return JSON.parse(await readFile(versionFile(settings, id), 'utf8')) as TrainerVersion
  } catch {
    return null
  }
}

async function writeVersion(settings: Settings, version: TrainerVersion): Promise<void> {
  await mkdir(version.path, { recursive: true })
  await writeFile(versionFile(settings, version.id), JSON.stringify(version, null, 2), 'utf8')
}

async function syncVersion(settings: Settings, version: TrainerVersion): Promise<TrainerVersion> {
  if (!existsSync(version.path)) {
    version.status = 'missing'
    return version
  }
  version.dirty = await isTrainerDirty(version.path)
  version.status = 'ok'
  if (version.runtimeId) {
    const runtime = await readRuntime(settings, version.runtimeId)
    version.runtimeState = runtime?.state ?? 'missing'
  }
  return version
}

export async function listTrainerVersions(settings: Settings): Promise<TrainerVersion[]> {
  const dir = trainerVersionsDir(settings)
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    const out: TrainerVersion[] = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const version = await readVersion(settings, entry.name)
      if (version) out.push(await syncVersion(settings, version))
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  } catch {
    return []
  }
}

export interface CreateTrainerVersionInput {
  branch: string
  commit: string
  name?: string
}

export async function createTrainerVersion(settings: Settings, input: CreateTrainerVersionInput): Promise<TrainerVersion> {
  await ensureTrainerMirror(settings)
  if (!(await trainerCommitExists(settings, input.commit))) throw new Error('训练器提交不存在，请先拉取仓库')
  const commits = await listTrainerCommits(settings, input.branch, 200)
  const commit = commits.find((item) => item.sha === input.commit)
  const id = `kohaku-${input.commit.slice(0, 7)}`
  const existing = await readVersion(settings, id)
  if (existing) return syncVersion(settings, existing)
  const path = trainerVersionDir(settings, id)
  await createTrainerWorktree(settings, input.commit, path)
  const stableSha = await trainerTagSha(settings)
  const version: TrainerVersion = {
    id,
    name: input.name?.trim() || `Kohaku ${input.commit.slice(0, 7)}`,
    branch: input.branch,
    commit: input.commit,
    shortCommit: commit?.short ?? input.commit.slice(0, 7),
    commitDate: commit?.date ?? new Date().toISOString(),
    subject: commit?.subject ?? '',
    author: commit?.author ?? '',
    channel: stableSha === input.commit ? 'stable' : 'experimental',
    path,
    runtimeId: '',
    runtimeState: 'missing',
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    dirty: false,
    status: 'ok',
  }
  await writeVersion(settings, version)
  return version
}

export async function removeTrainerVersion(settings: Settings, id: string): Promise<void> {
  const version = await readVersion(settings, id)
  if (!version) return
  const others = (await listTrainerVersions(settings)).filter((item) => item.id !== id)
  await removeTrainerWorktree(settings, version.path)
  await rm(trainerVersionDir(settings, id), { recursive: true, force: true })
  if (version.runtimeId && !others.some((item) => item.runtimeId === version.runtimeId)) {
    await rm(runtimeDir(settings, version.runtimeId), { recursive: true, force: true })
  }
}

export async function ensureTrainerRuntime(settings: Settings, versionId: string): Promise<TrainerRuntimeInfo> {
  const version = await readVersion(settings, versionId)
  if (!version) throw new Error('训练版本不存在')
  if (!existsSync(version.path)) throw new Error('训练版本目录不存在')
  if (version.runtimeId) {
    const existing = await readRuntime(settings, version.runtimeId)
    if (existing && existsSync(venvPython(existing.path))) return existing
  }
  const deps = parseDepsFromPyproject(version.path)
  const python = await pickPython(settings)
  const lockHash = hash(JSON.stringify({ python: python.version, platform: process.platform, arch: process.arch, deps: [...deps].sort() }))
  const runtimeId = `tr-py${python.version.replace(/\./g, '')}-${lockHash}`
  const existing = await readRuntime(settings, runtimeId)
  if (existing) {
    version.runtimeId = runtimeId
    version.runtimeState = existing.state
    await writeVersion(settings, version)
    return existing
  }
  const target = runtimeDir(settings, runtimeId)
  await mkdir(target, { recursive: true })
  const uv = await hasUv()
  const result = uv
    ? await run('uv', ['venv', target, '--python', python.path], { timeoutMs: 180_000 })
    : await run(python.path, ['-m', 'venv', target], { timeoutMs: 180_000 })
  if (result.code !== 0) throw new Error(`创建训练环境失败：${result.stderr.slice(-500)}`)
  const runtime: TrainerRuntimeInfo = {
    id: runtimeId,
    versionId,
    path: target,
    python: venvPython(target),
    pythonVersion: python.version,
    lockHash,
    state: 'created',
    deps,
    createdAt: new Date().toISOString(),
  }
  await writeRuntime(settings, runtime)
  version.runtimeId = runtimeId
  version.runtimeState = 'created'
  await writeVersion(settings, version)
  return runtime
}

export async function installTrainerRuntime(settings: Settings, versionId: string): Promise<TrainerRuntimeInfo> {
  const version = await readVersion(settings, versionId)
  if (!version) throw new Error('训练版本不存在')
  const runtime = await ensureTrainerRuntime(settings, versionId)
  runtime.state = 'installing'
  await writeRuntime(settings, runtime)
  version.runtimeState = 'installing'
  await writeVersion(settings, version)
  const python = runtime.python
  const index = settings.pipIndex ?? 'https://pypi.org/simple'
  const uv = await hasUv()
  const result = uv
    ? await run('uv', ['pip', 'install', '--python', python, '--index-url', index, '-e', version.path], {
        timeoutMs: 3_600_000,
      })
    : await run(python, ['-m', 'pip', 'install', '--index-url', index, '-e', version.path], {
        timeoutMs: 3_600_000,
      })
  runtime.state = result.code === 0 ? 'ready' : 'error'
  await writeRuntime(settings, runtime)
  version.runtimeState = runtime.state
  await writeVersion(settings, version)
  if (result.code !== 0) throw new Error(`训练依赖安装失败：${result.stderr.slice(-1200)}`)
  return runtime
}

export async function trainerDoctor(settings: Settings, versionId: string): Promise<{ ok: boolean; output: string }> {
  const version = await readVersion(settings, versionId)
  if (!version) throw new Error('训练版本不存在')
  const runtime = version.runtimeId ? await readRuntime(settings, version.runtimeId) : null
  if (!runtime || !existsSync(runtime.python)) {
    throw new Error('训练环境尚未创建，请先安装环境')
  }
  const bin = process.platform === 'win32' ? join(runtime.path, 'Scripts', 'kohakumoss-doctor.exe') : join(runtime.path, 'bin', 'kohakumoss-doctor')
  const command = existsSync(bin) ? bin : runtime.python
  const args = existsSync(bin) ? [] : ['-m', 'kohakumoss.cli.doctor']
  const result = await run(command, args, { cwd: version.path, timeoutMs: 120_000 })
  const output = `${result.stdout}${result.stderr}`.trim()
  return { ok: result.code === 0, output: output.slice(-12000) }
}

export async function trainerMirrorInfo(settings: Settings): Promise<{ ready: boolean; path: string }> {
  return { ready: existsSync(join(trainerMirror(settings), 'HEAD')), path: trainerMirror(settings) }
}

export async function trainerRuntimeSummary(settings: Settings, versionId: string): Promise<TrainerRuntimeInfo | null> {
  const version = await readVersion(settings, versionId)
  if (!version?.runtimeId) return null
  return readRuntime(settings, version.runtimeId)
}
