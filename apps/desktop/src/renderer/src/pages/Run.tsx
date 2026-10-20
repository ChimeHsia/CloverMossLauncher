import { Ban, FolderOpen, Image as ImageIcon, Play, RefreshCw, Send, Square, Terminal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Ipc } from '@shared/channels'
import type { JobRecord, JobStage, JobState } from '@shared/types'
import { call } from '../lib/api'
import { cloverUrl } from '../lib/clover'
import { dateTime, relative } from '../lib/format'
import { useApp } from '../store'
import { Button, Card, EmptyState, IconButton, Input, Pill, ProgressBar, Spinner, cn, useToast } from '../components/ui'

const stageLabel: Record<JobStage, string> = {
  idle: '等待',
  load: '加载',
  text: '文本编码',
  denoise: '去噪',
  decode: '解码',
  save: '保存',
  ready: '就绪',
}

const stateLabel: Record<JobState, string> = {
  queued: '排队中',
  starting: '启动中',
  running: '运行中',
  succeeded: '已完成',
  failed: '失败',
  canceled: '已取消',
}

const stages: JobStage[] = ['load', 'text', 'denoise', 'decode', 'save']

function stateTone(state: JobState): 'neutral' | 'accent' | 'amber' | 'red' {
  if (state === 'succeeded') return 'accent'
  if (state === 'failed') return 'red'
  if (state === 'running' || state === 'starting' || state === 'queued') return 'amber'
  return 'neutral'
}

function eta(ms?: number): string {
  if (!ms || ms < 0) return '—'
  const seconds = Math.round(ms / 1000)
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`
}

export function RunPage(): React.JSX.Element {
  const navigate = useNavigate()
  const toast = useToast()
  const jobs = useApp((state) => state.jobs)
  const activeJobId = useApp((state) => state.activeJobId)
  const jobLogs = useApp((state) => state.jobLogs)
  const startJob = useApp((state) => state.startJob)
  const cancelJob = useApp((state) => state.cancelJob)
  const sendJobInput = useApp((state) => state.sendJobInput)
  const setActiveJob = useApp((state) => state.setActiveJob)
  const loadJobLogs = useApp((state) => state.loadJobLogs)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const consoleRef = useRef<HTMLPreElement>(null)
  const active = jobs.find((job) => job.id === activeJobId) ?? jobs[0] ?? null
  const logs = active ? jobLogs[active.id] ?? [] : []

  useEffect(() => {
    if (!activeJobId && jobs[0]) setActiveJob(jobs[0].id)
  }, [activeJobId, jobs, setActiveJob])

  useEffect(() => {
    if (active && !jobLogs[active.id]) void loadJobLogs(active.id)
  }, [active?.id, jobLogs, loadJobLogs])

  useEffect(() => {
    if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight
  }, [logs])

  async function cancel(): Promise<void> {
    if (!active) return
    setBusy(true)
    try {
      await cancelJob(active.id)
      toast.push('正在停止任务…', 'info')
    } catch (error) {
      toast.push(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function retry(): Promise<void> {
    if (!active) return
    setBusy(true)
    try {
      const job = await startJob({
        instanceId: active.instanceId,
        prompt: active.params.prompt,
        negativePrompt: active.params.negativePrompt,
        width: active.params.width,
        height: active.params.height,
        steps: active.params.steps,
        cfg: active.params.cfg,
        seed: active.params.seed,
        profile: active.params.profile,
        workspace: active.workspace,
        gradio: active.gradio,
        mode: active.mode === 'simulate' ? 'simulate' : active.mode === 'gradio' ? 'gradio' : 'runner',
      })
      setActiveJob(job.id)
      toast.push('已重新提交任务', 'success')
    } catch (error) {
      toast.push(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function send(): Promise<void> {
    if (!active || !input.trim()) return
    await sendJobInput(active.id, input)
    setInput('')
  }

  if (!active) {
    return (
      <div className="space-y-4">
        <header>
          <h1 className="text-[22px] font-semibold tracking-tight">运行</h1>
          <p className="mt-1 text-[12px] text-[var(--color-text-secondary)]">
            任务进度、控制台与输出会显示在这里。
          </p>
        </header>
        <EmptyState
          icon={<Play className="size-7" />}
          title="还没有运行任务"
          description="去创作台写 Prompt、框选布局，然后点“开始生成”。"
          action={
            <Button tone="primary" onClick={() => navigate('/studio')}>
              去创作
            </Button>
          }
        />
      </div>
    )
  }

  const running = active.state === 'running' || active.state === 'starting'
  const stageIndex = stages.indexOf(active.stage)

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">运行</h1>
          <p className="mt-1 text-[12px] text-[var(--color-text-secondary)]">
            {active.instanceName} · {active.params.width}×{active.params.height} · {active.params.steps} 步 · seed{' '}
            {active.params.seed}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Pill tone={stateTone(active.state)}>{stateLabel[active.state]}</Pill>
          {running ? (
            <Button tone="danger" onClick={() => void cancel()} disabled={busy}>
              <span className="inline-flex items-center gap-1.5">
                <Square className="size-3.5" /> 停止
              </span>
            </Button>
          ) : (
            <Button tone="secondary" onClick={() => void retry()} disabled={busy}>
              <span className="inline-flex items-center gap-1.5">
                <RefreshCw className="size-3.5" /> 重试
              </span>
            </Button>
          )}
          <Button tone="ghost" onClick={() => navigate('/studio')}>
            去创作
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-[12.5px] font-medium">
                {stageLabel[active.stage]} · {Math.round(active.progress.percent)}%
              </div>
              <div className="flex items-center gap-2 text-[10.5px] text-[var(--color-text-tertiary)]">
                {running ? <Spinner className="size-3.5" /> : null}
                <span>
                  {active.progress.total ? `${active.progress.current}/${active.progress.total}` : '—'}
                </span>
                <span>ETA {eta(active.progress.etaMs)}</span>
              </div>
            </div>
            <ProgressBar value={active.progress.percent} className="mt-2.5" />
            <div className="mt-3 flex items-center gap-1">
              {stages.map((stage, index) => (
                <div key={stage} className="flex flex-1 items-center gap-1">
                  <div
                    className={cn(
                      'flex size-5 items-center justify-center rounded-full text-[9px] font-medium',
                      index < stageIndex || active.state === 'succeeded'
                        ? 'bg-accent-500 text-white'
                        : index === stageIndex
                          ? 'bg-accent-500/20 text-accent-700 ring-1 ring-accent-500/40 dark:text-accent-200'
                          : 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-tertiary)]',
                    )}
                  >
                    {index + 1}
                  </div>
                  {index < stages.length - 1 ? (
                    <div
                      className={cn(
                        'h-px flex-1',
                        index < stageIndex ? 'bg-accent-500/50' : 'bg-[var(--color-border)]',
                      )}
                    />
                  ) : null}
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex justify-between text-[9.5px] text-[var(--color-text-tertiary)]">
              {stages.map((stage) => (
                <span key={stage}>{stageLabel[stage]}</span>
              ))}
            </div>
            {active.progress.message ? (
              <p className="mt-2 truncate text-[10.5px] text-[var(--color-text-tertiary)]">
                {active.progress.message}
              </p>
            ) : null}
            {active.error ? (
              <p className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-[11px] text-red-600 dark:text-red-300">
                {active.error.code} · {active.error.message}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-[var(--color-text-tertiary)]">
              <span>开始于 {dateTime(active.startedAt)}</span>
              {active.endedAt ? <span>· 结束于 {dateTime(active.endedAt)}</span> : null}
              {active.exitCode !== undefined ? <span>· exit {active.exitCode}</span> : null}
              <button
                type="button"
                onClick={() => void call(Ipc.jobOpenLog, { id: active.id })}
                className="ml-auto inline-flex items-center gap-1 text-accent-600 hover:underline dark:text-accent-300"
              >
                <FolderOpen className="size-3" /> 打开日志
              </button>
            </div>
          </Card>

          {active.outputs?.length ? (
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[13px] font-semibold">输出</h2>
                <Button tone="ghost" onClick={() => navigate('/gallery')}>
                  在画廊查看
                </Button>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {active.outputs.map((output) => (
                  <button
                    key={output.path}
                    type="button"
                    onClick={() => navigate('/gallery')}
                    className="h-32 overflow-hidden rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-tertiary)]"
                  >
                    <img src={cloverUrl(output.path)} alt="" className="size-full object-cover" />
                  </button>
                ))}
              </div>
            </Card>
          ) : null}

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-4 py-2.5">
              <div className="flex items-center gap-2 text-[12.5px] font-medium">
                <Terminal className="size-3.5" /> 控制台
              </div>
              <span className="text-[10px] text-[var(--color-text-tertiary)]">{logs.length} 行</span>
            </div>
            <pre
              ref={consoleRef}
              className="h-64 overflow-y-auto bg-white/35 px-4 py-3 font-mono text-[10.5px] leading-5 dark:bg-black/20"
            >
              {logs.length === 0
                ? '等待输出…'
                : logs.map((line) => (
                    <div
                      key={`${line.jobId}-${line.seq}`}
                      className={
                        line.stream === 'stderr'
                          ? 'text-red-600 dark:text-red-300'
                          : line.stream === 'system'
                            ? 'text-accent-700 dark:text-accent-200'
                            : 'text-[var(--color-text-secondary)]'
                      }
                    >
                      {line.text}
                    </div>
                  ))}
            </pre>
            {running ? (
              <div className="flex items-center gap-2 border-t border-[var(--color-border-subtle)] px-3 py-2">
                <Input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void send()
                  }}
                  placeholder="向进程 stdin 发送一行（例如确认提示）"
                  className="min-w-0 flex-1 font-mono"
                />
                <IconButton label="发送" onClick={() => void send()}>
                  <Send className="size-3.5" />
                </IconButton>
              </div>
            ) : null}
          </Card>
        </div>

        <Card className="h-fit overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-3 py-2.5">
            <div className="text-[12px] font-medium">任务历史</div>
            <span className="text-[10px] text-[var(--color-text-tertiary)]">{jobs.length}</span>
          </div>
          <div className="max-h-[70vh] overflow-y-auto p-1.5">
            {jobs.length === 0 ? (
              <div className="px-3 py-6 text-center text-[11px] text-[var(--color-text-tertiary)]">暂无任务</div>
            ) : (
              jobs.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => {
                    setActiveJob(job.id)
                    void loadJobLogs(job.id)
                  }}
                  className={cn(
                    'mb-1 flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition',
                    job.id === active.id
                      ? 'bg-accent-500/10 ring-1 ring-inset ring-accent-500/20'
                      : 'hover:bg-white/40 dark:hover:bg-white/[0.04]',
                  )}
                >
                  <span
                    className={cn(
                      'mt-1 size-2 shrink-0 rounded-full',
                      job.state === 'succeeded'
                        ? 'bg-accent-500'
                        : job.state === 'failed'
                          ? 'bg-red-500'
                          : job.state === 'running'
                            ? 'bg-amber-500'
                            : 'bg-[var(--color-text-tertiary)]',
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-medium">
                      {job.params.width}×{job.params.height} · {job.params.steps} 步
                    </span>
                    <span className="mt-0.5 block truncate text-[9.5px] text-[var(--color-text-tertiary)]">
                      {stateLabel[job.state]} · {relative(job.startedAt)}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
