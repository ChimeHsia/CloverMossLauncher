import { createHash, randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { RuntimeInfo, RuntimeMode, Settings } from '@shared/types'
import { Events } from '@shared/channels'
import { emit } from '../lib/events'
import { paths } from '../lib/paths'
import { firstLine, run, runStream, tail } from '../lib/run'
import { getLastNetwork } from './network'

export const MOSS_DEPS = [
  'torch>=2.9',
  'diffusers>=0.38',
  'transformers>=5.3',
  'accelerate>=1.10',
  'safetensors>=0.6',
  'Pillow>=10',
]

type Logger = (line: string, stream?: 'stdout' | 'stderr') => void

function logFor(runtimeId: string, instanceId: string, logger?: Logger): Logger {
  return (line, stream = 'stdout') => {
    logger?.(line, stream)
    emit(Events.runtimeLog, { runtimeId, instanceId, line, stream, at: new Date().toISOString() })
  }
}

export function venvPython(dir: string): string {
  return process.platform === 'win32' ? join(dir, 'Scripts', 'python.exe') : join(dir, 'bin', 'python3')
}

export function depsFile(runtimeId: string): string {
  return join(paths.runtime(runtimeId), 'runtime.json')
}

export async function readRuntime(runtimeId: string): Promise<RuntimeInfo | null> {
  try {
    return JSON.parse(await readFile(depsFile(runtimeId), 'utf8')) as RuntimeInfo
  } catch {
    return null
  }
}

async function writeRuntime(runtime: RuntimeInfo): Promise<void> {
  await mkdir(paths.runtime(runtime.id), { recursive: true })
  await writeFile(depsFile(runtime.id), JSON.stringify(runtime, null, 2), 'utf8')
}

/** Persist the local shadow record for a remote venv (state/path live remotely). */
export async function writeRemoteRuntime(runtime: RuntimeInfo): Promise<void> {
  await writeRuntime(runtime)
}

export async function listRuntimes(): Promise<RuntimeInfo[]> {
  try {
    const entries = await readdir(paths.runtimes(), { withFileTypes: true })
    const out: RuntimeInfo[] = []
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === 'python') continue
      const runtime = await readRuntime(entry.name)
      if (runtime) out.push(runtime)
    }
    return out
  } catch {
    return []
  }
}

async function which(name: string): Promise<string | null> {
  const result = await run(process.platform === 'win32' ? 'where' : 'which', [name], { timeoutMs: 3000 })
  return result.code === 0 ? firstLine(result.stdout) || null : null
}

async function pythonVersion(path: string): Promise<string | null> {
  const result = await run(path, ['--version'], { timeoutMs: 5000 })
  const match = `${result.stdout}${result.stderr}`.match(/Python\s+(\d+\.\d+\.\d+)/)
  return match?.[1] ?? null
}

export async function pickPython(settings: Settings): Promise<{ path: string; version: string }> {
  if (settings.pythonPath) {
    const version = await pythonVersion(settings.pythonPath)
    if (version) return { path: settings.pythonPath, version }
  }
  const names = ['python3.13', 'python3.12', 'python3.11', 'python3.10', 'python3', 'python']
  for (const name of names) {
    const path = await which(name)
    if (!path) continue
    const version = await pythonVersion(path)
    if (version) return { path, version }
  }
  throw new Error('未找到 Python 3.10+。可在设置中指定解释器，或稍后安装托管 Python。')
}

export function parseDepsFromPyproject(instanceDir: string): string[] {
  try {
    const text = readFileSync(join(instanceDir, 'pyproject.toml'), 'utf8')
    const project = text.match(/\[project\][\s\S]*?(?=\n\[|$)/)
    if (project) {
      const deps = project[0].match(/dependencies\s*=\s*\[([\s\S]*?)\]/)
      if (deps) {
        const list = [...deps[1]!.matchAll(/["']([^"']+)["']/g)]
          .map((match) => match[1]!)
          .filter((dep) => !dep.startsWith('-e') && dep.trim().length > 0)
        if (list.length) return list
      }
    }
  } catch {
    // fall through
  }
  return [...MOSS_DEPS]
}

function lockHash(pythonVersionText: string, deps: string[]): string {
  return createHash('sha256')
    .update(JSON.stringify({ python: pythonVersionText, platform: process.platform, arch: process.arch, deps: [...deps].sort() }))
    .digest('hex')
}

export async function hasUv(): Promise<boolean> {
  return (await which('uv')) !== null
}

async function createVenv(runtime: RuntimeInfo, python: string, logger: Logger): Promise<void> {
  const target = paths.runtime(runtime.id)
  if (existsSync(venvPython(target))) {
    logger(`复用已有虚拟环境：${target}`)
    return
  }
  await mkdir(paths.runtimes(), { recursive: true })
  const env = {
    UV_CACHE_DIR: join(paths.cache(), 'uv'),
    PIP_CACHE_DIR: join(paths.cache(), 'pip'),
  }
  const uv = await hasUv()
  logger(uv ? `使用 uv 创建运行时（Python ${runtime.pythonVersion}）` : `使用 venv 创建运行时（Python ${runtime.pythonVersion}）`)
  const result = uv
    ? await runStream('uv', ['venv', target, '--python', python], { timeoutMs: 180_000, env }, (line, stream) => logger(line, stream))
    : await runStream(python, ['-m', 'venv', target], { timeoutMs: 180_000, env }, (line, stream) => logger(line, stream))
  if (result.code !== 0) throw new Error(`创建虚拟环境失败：${tail(result.stderr)}`)
}

export interface EnsureRuntimeInput {
  instanceId: string
  instanceDir: string
  mode: RuntimeMode
  settings: Settings
  python?: { path: string; version: string }
  logger?: Logger
}

export async function ensureRuntime(input: EnsureRuntimeInput): Promise<RuntimeInfo> {
  const deps = parseDepsFromPyproject(input.instanceDir)
  const python = input.python ?? (await pickPython(input.settings))
  const lock = lockHash(python.version, deps)

  if (input.mode === 'shared') {
    const existing = (await listRuntimes()).find(
      (runtime) => runtime.kind === 'shared' && runtime.lockHash === lock && runtime.state !== 'error',
    )
    if (existing) {
      if (!existing.instanceIds.includes(input.instanceId)) {
        existing.instanceIds.push(input.instanceId)
        await writeRuntime(existing)
      }
      return existing
    }
  }

  const id =
    input.mode === 'shared'
      ? `py${python.version.replace(/\./g, '')}-${lock.slice(0, 8)}`
      : `py${python.version.replace(/\./g, '')}-${lock.slice(0, 8)}-${randomBytes(3).toString('hex')}`

  const runtime: RuntimeInfo = {
    id,
    instanceId: input.instanceId,
    instanceIds: [input.instanceId],
    path: paths.runtime(id),
    python: python.path,
    pythonVersion: python.version,
    lockHash: lock,
    kind: input.mode,
    state: 'created',
    deps,
    createdAt: new Date().toISOString(),
  }

  const logger = logFor(id, input.instanceId, input.logger)
  await createVenv(runtime, python.path, logger)
  await writeRuntime(runtime)
  return runtime
}

export async function installDeps(runtimeId: string, settings: Settings, logger?: Logger): Promise<RuntimeInfo> {
  const runtime = await readRuntime(runtimeId)
  if (!runtime) throw new Error('运行时不存在')
  const loggerForRun = logFor(runtimeId, runtime.instanceId, logger)

  runtime.state = 'installing'
  await writeRuntime(runtime)

  const index = settings.pipIndex ?? getLastNetwork()?.selected.pip ?? 'https://pypi.org/simple'
  const python = venvPython(paths.runtime(runtimeId))
  const env = {
    PIP_CACHE_DIR: join(paths.cache(), 'pip'),
    UV_CACHE_DIR: join(paths.cache(), 'uv'),
  }

  loggerForRun(`安装依赖（${runtime.deps.length} 个）来自 ${index}`)
  const uv = await hasUv()
  let result
  if (uv) {
    result = await runStream(
      'uv',
      ['pip', 'install', '--python', python, '--index-url', index, ...runtime.deps],
      { timeoutMs: 3_600_000, env },
      (line, stream) => loggerForRun(line, stream),
    )
  } else {
    const upgrade = await runStream(
      python,
      ['-m', 'pip', 'install', '--upgrade', 'pip'],
      { timeoutMs: 300_000, env },
      (line, stream) => loggerForRun(line, stream),
    )
    if (upgrade.code !== 0) loggerForRun('升级 pip 失败，继续尝试安装', 'stderr')
    result = await runStream(
      python,
      ['-m', 'pip', 'install', '--index-url', index, ...runtime.deps],
      { timeoutMs: 3_600_000, env },
      (line, stream) => loggerForRun(line, stream),
    )
  }

  if (result.code !== 0) {
    runtime.state = 'error'
    await writeRuntime(runtime)
    throw new Error(`依赖安装失败：${tail(result.stderr || result.stdout)}`)
  }

  runtime.state = 'ready'
  await writeRuntime(runtime)
  loggerForRun('依赖安装完成')
  return runtime
}

export async function setRuntimeState(runtimeId: string, state: RuntimeInfo['state']): Promise<void> {
  const runtime = await readRuntime(runtimeId)
  if (!runtime) return
  runtime.state = state
  await writeRuntime(runtime)
}
