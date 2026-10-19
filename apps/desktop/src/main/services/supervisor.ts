import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import net from 'node:net'
import { join } from 'node:path'
import { app } from 'electron'
import { Events } from '@shared/channels'
import type { JobLogLine, JobParams, JobRecord, JobStage, JobState } from '@shared/types'
import { emit } from '../lib/events'
import { paths } from '../lib/paths'
import { getInstance } from './instances'
import { readRuntime, venvPython } from './runtimes'
import { getSettings } from './settings'
import { pushDiagnostic } from './diagnostics'
import {
  LineSplitter,
  exitRule,
  loadRules,
  matchRule,
  parseDownloadProgress,
  parseTqdm,
  progressFor,
  stripAnsi,
  toDiagnostic,
} from './parsers'

const PREFIX = '@@CLOVER@@ '
const DEFAULT_MODEL = 'OpenMOSS-Team/MOSS-Image-SFT'
const MAX_LOG_LINES = 2000

interface RunningJob {
  child: ChildProcessWithoutNullStreams
  out: LineSplitter
  err: LineSplitter
  readyTimer: NodeJS.Timeout
  killTimer?: NodeJS.Timeout
  lastLines: string[]
  cancelRequested: boolean
}

const jobs = new Map<string, JobRecord>()
const logs = new Map<string, JobLogLine[]>()
const running = new Map<string, RunningJob>()
const seqs = new Map<string, number>()
let loaded = false

function jobsDir(): string {
  return join(paths.root(), 'jobs')
}

function logPath(jobId: string): string {
  return join(jobsDir(), `${jobId}.jsonl`)
}

async function loadJobs(): Promise<void> {
  if (loaded) return
  loaded = true
  try {
    const raw = JSON.parse(await readFile(join(jobsDir(), 'jobs.json'), 'utf8')) as JobRecord[]
    for (const job of raw) {
      if (job.state === 'running' || job.state === 'starting' || job.state === 'queued') {
        job.state = 'failed'
        job.error = { code: 'E_INTERRUPTED', message: '应用重启，任务已中断' }
        job.endedAt = new Date().toISOString()
      }
      jobs.set(job.id, job)
    }
  } catch {
    // first run
  }
}

async function saveJobs(): Promise<void> {
  try {
    await mkdir(jobsDir(), { recursive: true })
    const list = [...jobs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 60)
    await writeFile(join(jobsDir(), 'jobs.json'), JSON.stringify(list, null, 2), 'utf8')
  } catch {
    // best effort
  }
}

function snapshot(job: JobRecord): JobRecord {
  return { ...job, params: { ...job.params }, progress: { ...job.progress } }
}

function update(job: JobRecord, patch: Partial<JobRecord>): void {
  Object.assign(job, patch)
  emit(Events.job, snapshot(job))
  void saveJobs()
}

function appendLog(job: JobRecord, stream: JobLogLine['stream'], text: string, runningJob?: RunningJob): void {
  const trimmed = stripAnsi(text).replace(/\r/g, '').trimEnd()
  if (!trimmed) return
  const seq = (seqs.get(job.id) ?? 0) + 1
  seqs.set(job.id, seq)
  const line: JobLogLine = {
    jobId: job.id,
    seq,
    at: new Date().toISOString(),
    stream,
    text: trimmed.slice(0, 8000),
  }
  const list = logs.get(job.id) ?? []
  list.push(line)
  if (list.length > MAX_LOG_LINES) list.splice(0, list.length - MAX_LOG_LINES)
  logs.set(job.id, list)
  if (runningJob) {
    runningJob.lastLines.push(trimmed)
    if (runningJob.lastLines.length > 40) runningJob.lastLines.shift()
  }
  emit(Events.jobLog, line)
  void appendFile(logPath(job.id), `${JSON.stringify(line)}\n`, 'utf8').catch(() => undefined)
}

function recordError(job: JobRecord, raw: string, rule = matchRule(raw)): void {
  if (!rule) return
  const diagnostic = toDiagnostic(rule, raw, job.id)
  pushDiagnostic(diagnostic)
}

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(7860))
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 7860
      server.close(() => resolve(port))
    })
  })
}

function runnerScript(): string {
  const candidates = [
    join(app.getAppPath(), '..', '..', 'runner', 'runner.py'),
    join(process.resourcesPath, 'runner', 'runner.py'),
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!
}

function envFor(job: JobRecord): NodeJS.ProcessEnv {
  return {
    PYTHONUNBUFFERED: '1',
    PYTHONIOENCODING: 'utf-8',
    PYTHONPATH: '.',
    PYTORCH_ENABLE_MPS_FALLBACK: '1',
    TOKENIZERS_PARALLELISM: 'false',
    HF_HOME: join(paths.models(getSettings().modelsRoot), 'hf'),
    HF_HUB_CACHE: join(paths.models(getSettings().modelsRoot), 'hf', 'hub'),
    CLOVER_JOB_ID: job.id,
    CLOVER_INSTANCE_ID: job.instanceId,
    ...(job.deviceId?.startsWith('cuda:') ? { CUDA_VISIBLE_DEVICES: job.deviceId.slice(5) } : {}),
  }
}

function killTree(child: ChildProcessWithoutNullStreams): void {
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true })
    } else if (child.pid) {
      process.kill(-child.pid, 'SIGKILL')
    }
  } catch {
    try {
      child.kill('SIGKILL')
    } catch {
      // already gone
    }
  }
}

function finish(job: JobRecord, runningJob: RunningJob, code: number | null): void {
  if (!running.has(job.id)) return
  clearTimeout(runningJob.readyTimer)
  if (runningJob.killTimer) clearTimeout(runningJob.killTimer)
  for (const line of runningJob.out.flush()) appendLog(job, 'stdout', line, runningJob)
  for (const line of runningJob.err.flush()) appendLog(job, 'stderr', line, runningJob)
  running.delete(job.id)

  const exitCode = code ?? -1
  if (job.state === 'succeeded' || job.state === 'canceled') {
    update(job, { endedAt: new Date().toISOString(), exitCode })
    return
  }

  if (runningJob.cancelRequested) {
    update(job, { state: 'canceled', endedAt: new Date().toISOString(), exitCode })
    return
  }

  if (job.error) {
    update(job, { state: 'failed', endedAt: new Date().toISOString(), exitCode })
    return
  }

  if (exitCode === 0) {
    update(job, {
      state: 'failed',
      error: { code: 'E_NO_RESULT', message: '进程已退出，但没有返回生成结果' },
      endedAt: new Date().toISOString(),
      exitCode,
    })
    pushDiagnostic({
      jobId: job.id,
      ruleId: 'E_NO_RESULT',
      severity: 'error',
      title: '没有返回结果',
      explain: 'runner 正常退出，但没有发送 result 事件。请检查实例代码与模型路径。',
      solutions: [{ label: '查看日志', action: 'open_log' }],
      raw: runningJob.lastLines.slice(-10).join('\n'),
      signature: `E_NO_RESULT:${job.id}`,
    })
    return
  }

  const last = runningJob.lastLines.slice(-12).join('\n')
  const matched = runningJob.lastLines.map((line) => matchRule(line)).find(Boolean)
  const rule = matched ?? exitRule()
  const diagnostic = toDiagnostic(rule, last, job.id)
  pushDiagnostic(diagnostic)
  update(job, {
    state: 'failed',
    error: { code: rule.id, message: rule.title },
    endedAt: new Date().toISOString(),
    exitCode,
  })
}

function handleRunnerEvent(job: JobRecord, runningJob: RunningJob, payload: string): void {
  let event: Record<string, unknown>
  try {
    event = JSON.parse(payload) as Record<string, unknown>
  } catch {
    appendLog(job, 'system', `无法解析 runner 事件：${payload.slice(0, 200)}`, runningJob)
    return
  }
  const type = String(event['type'] ?? '')
  if (type === 'ready') {
    clearTimeout(runningJob.readyTimer)
    update(job, { state: 'running', stage: 'ready' })
    return
  }
  if (type === 'stage') {
    const stage = String(event['name'] ?? '') as JobStage
    const allowed: JobStage[] = ['load', 'text', 'denoise', 'decode', 'save']
    if (allowed.includes(stage)) {
      update(job, {
        state: job.state === 'starting' ? 'running' : job.state,
        stage,
        progress: {
          ...job.progress,
          stage,
          current: stage === 'denoise' ? 0 : job.progress.current,
          percent: stage === 'denoise' ? 0 : job.progress.percent,
        },
      })
    }
    return
  }
  if (type === 'progress') {
    const current = Number(event['current'] ?? 0)
    const total = Number(event['total'] ?? 0)
    const percent = Number(event['percent'] ?? (total ? (current / total) * 100 : 0))
    update(job, {
      state: job.state === 'starting' ? 'running' : job.state,
      progress: {
        stage: (String(event['stage'] ?? job.stage) as JobStage) || job.stage,
        current,
        total,
        percent: Math.max(job.progress.percent, Math.min(100, percent)),
        etaMs: typeof event['eta_ms'] === 'number' ? (event['eta_ms'] as number) : undefined,
        message: typeof event['message'] === 'string' ? (event['message'] as string) : undefined,
      },
    })
    return
  }
  if (type === 'log') {
    appendLog(job, 'system', String(event['message'] ?? ''), runningJob)
    return
  }
  if (type === 'result') {
    const outputs = Array.isArray(event['images'])
      ? (event['images'] as Array<Record<string, unknown>>).map((image) => ({
          path: String(image['path'] ?? ''),
          width: Number(image['width'] ?? job.params.width),
          height: Number(image['height'] ?? job.params.height),
          seed: Number(image['seed'] ?? job.params.seed),
        }))
      : []
    update(job, {
      state: 'succeeded',
      stage: 'save',
      progress: { ...job.progress, stage: 'save', percent: 100 },
      outputs,
    })
    return
  }
  if (type === 'error') {
    const code = String(event['code'] ?? 'E_INTERNAL')
    const message = String(event['message'] ?? '运行失败')
    const rule =
      loadRules().find((candidate) => candidate.id === code) ??
      matchRule(`${code} ${message}`) ?? {
        id: code,
        match: null,
        severity: 'error' as const,
        title: message.slice(0, 60) || '运行失败',
        explain: message,
        solutions: [{ label: '查看日志', action: 'open_log' }],
      }
    pushDiagnostic(toDiagnostic(rule, String(event['traceback'] ?? message), job.id))
    update(job, {
      state: 'failed',
      error: { code, message },
      endedAt: new Date().toISOString(),
    })
    return
  }
  if (type === 'canceled') {
    update(job, { state: 'canceled', endedAt: new Date().toISOString() })
    return
  }
  if (type === 'bye') {
    const code = Number(event['exit_code'] ?? 0)
    update(job, { exitCode: code })
  }
}

function handleLine(job: JobRecord, runningJob: RunningJob, stream: 'stdout' | 'stderr', raw: string): void {
  const line = stripAnsi(raw).trimEnd()
  if (!line.trim()) return

  if (line.startsWith(PREFIX)) {
    handleRunnerEvent(job, runningJob, line.slice(PREFIX.length))
    return
  }

  appendLog(job, stream, line, runningJob)

  if (job.mode === 'gradio') {
    const url = line.match(/Running on local URL:\s*(http:\/\/\S+)/)
    if (url?.[1]) {
      clearTimeout(runningJob.readyTimer)
      update(job, { state: 'running', stage: 'ready', url: url[1] })
      return
    }
  }

  const download = parseDownloadProgress(line)
  if (download) {
    update(job, {
      progress: {
        stage: 'load',
        current: 0,
        total: 0,
        percent: download.percent,
        message: `${download.label ?? '下载'} ${download.rate ?? ''}`.trim(),
      },
    })
    return
  }

  const progress = progressFor(line, job.stage, job.progress)
  if (progress) {
    update(job, { progress })
    return
  }

  const tqdm = parseTqdm(line)
  if (tqdm && job.stage === 'idle') {
    update(job, {
      progress: {
        stage: 'denoise',
        current: tqdm.current,
        total: tqdm.total,
        percent: tqdm.percent,
        etaMs: tqdm.etaMs,
        message: tqdm.rate,
      },
    })
  }

  if (stream === 'stderr' || /error|traceback|exception/i.test(line)) {
    recordError(job, line)
  }
}

export interface StartJobInput {
  instanceId: string
  caseId?: string
  caseName?: string
  backend?: 'official' | 'clover'
  deviceId?: string
  kind?: 'inference' | 'training'
  trainerVersionId?: string
  prompt: string
  negativePrompt?: string
  width: number
  height: number
  steps: number
  cfg: number
  seed: number
  profile?: 'base' | 'dmd8'
  mode?: 'runner' | 'gradio' | 'simulate'
  port?: number | null
  extraArgs?: string
}

export async function startJob(input: StartJobInput): Promise<JobRecord> {
  await loadJobs()
  const instance = await getInstance(input.instanceId)
  if (!instance) throw new Error('实例不存在')
  const mode = input.mode ?? 'runner'
  const runtime = await readRuntime(instance.runtimeId)
  if (mode !== 'simulate' && (!runtime || runtime.state !== 'ready')) {
    pushDiagnostic({
      jobId: undefined,
      ruleId: 'E_RUNTIME',
      severity: 'error',
      title: '运行时未就绪',
      explain: '这个实例还没有安装 Python 依赖。先到实例详情里点“安装依赖”。',
      solutions: [{ label: '打开实例', action: 'open_instances' }],
      raw: 'runtime not ready',
      signature: `E_RUNTIME:${instance.id}`,
      toast: false,
    })
    throw new Error('运行时尚未安装依赖，请先在实例详情中安装依赖')
  }

  if (mode !== 'simulate') {
    const modelDir = join(paths.hub(getSettings().modelsRoot), 'models--OpenMOSS-Team--MOSS-Image-SFT')
    if (!existsSync(modelDir)) {
      pushDiagnostic({
        jobId: undefined,
        ruleId: 'E_MODEL',
        severity: 'error',
        title: '还没有下载 MOSS-Image 权重',
        explain: '运行需要约 27 GB 的 SFT 权重。请先在模型页下载，或改用已缓存的量化包。',
        solutions: [{ label: '打开模型库', action: 'open_models' }],
        raw: 'model missing',
        signature: 'E_MODEL:moss-sft',
        toast: false,
      })
      throw new Error('尚未下载 MOSS-Image 权重（约 27 GB），请先在模型页下载')
    }
  }
  const python = runtime ? venvPython(runtime.path) : process.platform === 'win32' ? 'python' : 'python3'
  if (!existsSync(python) && mode !== 'simulate') {
    throw new Error('找不到运行时 Python，请修复运行时')
  }

  const params: JobParams = {
    prompt: input.prompt,
    negativePrompt: input.negativePrompt ?? '',
    width: input.width,
    height: input.height,
    steps: input.steps,
    cfg: input.cfg,
    seed: input.seed,
    profile: input.profile ?? 'base',
  }
  const job: JobRecord = {
    id: `job-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`,
    instanceId: instance.id,
    instanceName: instance.name,
    caseId: input.caseId,
    caseName: input.caseName,
    backend: input.backend,
    deviceId: input.deviceId,
    kind: input.kind ?? 'inference',
    mode,
    state: 'starting',
    stage: 'idle',
    params,
    progress: { stage: 'idle', current: 0, total: params.steps, percent: 0 },
    startedAt: new Date().toISOString(),
  }
  job.logPath = logPath(job.id)
  jobs.set(job.id, job)
  logs.set(job.id, [])
  seqs.set(job.id, 0)
  emit(Events.job, snapshot(job))

  const jobFile = join(jobsDir(), `${job.id}.json`)
  await mkdir(jobsDir(), { recursive: true })
  const outputDir = join(instance.path, 'outputs')
  await writeFile(
    jobFile,
    JSON.stringify(
      {
        job_id: job.id,
        instance_id: instance.id,
        model: { repo: DEFAULT_MODEL },
        prompt: params.prompt,
        negative_prompt: params.negativePrompt,
        width: params.width,
        height: params.height,
        steps: params.steps,
        guidance_scale: params.cfg,
        seed: params.seed,
        batch: 1,
        profile: params.profile,
        adapters: params.adapters ?? [],
        output_dir: outputDir,
        device: input.deviceId ?? (process.platform === 'darwin' ? 'mps' : 'cpu'),
        dtype: 'float16',
        options: { vae_tiling: true, attention_slicing: false },
      },
      null,
      2,
    ),
    'utf8',
  )

  let command: string
  let args: string[]
  if (mode === 'gradio') {
    const port = input.port ?? (await freePort())
    command = python
    args = [join(instance.path, 'gradio_app.py'), '--host', '127.0.0.1', '--port', String(port)]
    if (input.extraArgs?.trim()) args.push(...input.extraArgs.trim().split(/\s+/))
  } else {
    command = python
    args = [runnerScript(), '--job', jobFile, ...(mode === 'simulate' ? ['--simulate'] : [])]
  }

  let child: ChildProcessWithoutNullStreams
  try {
    child = spawn(command, args, {
      cwd: instance.path,
      env: { ...process.env, ...envFor(job) },
      detached: process.platform !== 'win32',
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    update(job, { state: 'failed', error: { code: 'E_SPAWN', message } })
    throw error
  }

  const readyTimer = setTimeout(() => {
    if (job.state === 'starting') {
      pushDiagnostic({
        jobId: job.id,
        ruleId: 'E_TIMEOUT',
        severity: 'error',
        title: '启动超时',
        explain: 'runner 在 180 秒内没有就绪，通常是权重加载失败或依赖缺失。',
        solutions: [{ label: '查看日志', action: 'open_log' }, { label: '打开实例', action: 'open_settings' }],
        raw: 'ready timeout',
        signature: `E_TIMEOUT:${job.id}`,
      })
      update(job, { state: 'failed', error: { code: 'E_TIMEOUT', message: '启动超时' } })
      killTree(child)
    }
  }, 180_000)

  const runningJob: RunningJob = {
    child,
    out: new LineSplitter(),
    err: new LineSplitter(),
    readyTimer,
    lastLines: [],
    cancelRequested: false,
  }
  running.set(job.id, runningJob)
  update(job, { pid: child.pid ?? undefined })

  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    for (const line of runningJob.out.push(chunk)) handleLine(job, runningJob, 'stdout', line)
  })
  child.stderr.on('data', (chunk: string) => {
    for (const line of runningJob.err.push(chunk)) handleLine(job, runningJob, 'stderr', line)
  })
  child.on('error', (error) => {
    appendLog(job, 'system', String(error), runningJob)
    update(job, { state: 'failed', error: { code: 'E_SPAWN', message: String(error) } })
    finish(job, runningJob, -1)
  })
  child.on('close', (code) => finish(job, runningJob, code))

  return snapshot(job)
}

export async function cancelJob(id: string): Promise<JobRecord | null> {
  const job = jobs.get(id)
  const runningJob = running.get(id)
  if (!job) return null
  if (!runningJob) {
    if (job.state === 'running' || job.state === 'starting') {
      update(job, { state: 'canceled', endedAt: new Date().toISOString() })
    }
    return snapshot(job)
  }
  runningJob.cancelRequested = true
  appendLog(job, 'system', '正在停止任务…', runningJob)
  try {
    runningJob.child.stdin.write(`${PREFIX}{"cmd":"cancel"}\n`)
  } catch {
    // ignore
  }
  runningJob.killTimer = setTimeout(() => killTree(runningJob.child), 5000)
  return snapshot(job)
}

export function inputJob(id: string, text: string): void {
  const job = jobs.get(id)
  const runningJob = running.get(id)
  if (!job || !runningJob) return
  try {
    runningJob.child.stdin.write(`${text}\n`)
    appendLog(job, 'system', `> ${text}`, runningJob)
  } catch {
    // stdin may be closed already
  }
}

export async function listJobs(): Promise<JobRecord[]> {
  await loadJobs()
  return [...jobs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map(snapshot)
}

export async function getJob(id: string): Promise<JobRecord | null> {
  await loadJobs()
  const job = jobs.get(id)
  return job ? snapshot(job) : null
}

export async function getJobLogs(id: string): Promise<JobLogLine[]> {
  if (logs.has(id)) return [...(logs.get(id) ?? [])]
  try {
    const text = await readFile(logPath(id), 'utf8')
    const parsed = text
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as JobLogLine)
    logs.set(id, parsed.slice(-MAX_LOG_LINES))
    return parsed.slice(-MAX_LOG_LINES)
  } catch {
    return []
  }
}

export async function listJobLogFiles(): Promise<string[]> {
  try {
    return (await readdir(jobsDir())).filter((name) => name.endsWith('.jsonl')).map((name) => join(jobsDir(), name))
  } catch {
    return []
  }
}
