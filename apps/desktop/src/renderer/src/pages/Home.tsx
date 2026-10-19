import {
  ChevronDown,
  ExternalLink,
  FolderCog,
  ListChecks,
  Play,
  Settings2,
  Square,
  SquareTerminal,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Select as AppsSelect } from '@openai/apps-sdk-ui/components/Select'
import { Ipc } from '@shared/channels'
import type { LaunchRow, LaunchStartInput } from '@shared/types'
import { call } from '../lib/api'
import { openWindow } from '../lib/windows'
import { useApp } from '../store'
import { Button, IconButton, Pill, Spinner, cn, useToast } from '../components/ui'

function Field({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <label className="flex min-w-0 flex-col gap-0.5">
      <span className="px-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-tertiary)]">
        {label}
      </span>
      {children}
    </label>
  )
}

function Select({
  value,
  onChange,
  options,
  disabled,
  className,
}: {
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string; disabled?: boolean }>
  disabled?: boolean
  className?: string
}): React.JSX.Element {
  return (
    <AppsSelect
      size="2xs"
      block={false}
      side="top"
      value={value}
      options={options}
      disabled={disabled}
      onChange={(option) => onChange(option.value)}
      triggerClassName={cn('min-w-[92px] text-[10.5px]', className)}
    />
  )
}

const stateLabel: Record<LaunchRow['state'], string> = {
  queued: '排队中',
  starting: '启动中',
  running: '运行中',
  stopped: '已停止',
  failed: '失败',
}

const stateTone: Record<LaunchRow['state'], 'neutral' | 'amber' | 'accent' | 'red'> = {
  queued: 'neutral',
  starting: 'amber',
  running: 'accent',
  stopped: 'neutral',
  failed: 'red',
}

export function HomePage(): React.JSX.Element {
  const navigate = useNavigate()
  const toast = useToast()
  const instances = useApp((state) => state.instances)
  const allDevices = useApp((state) => state.devices)
  const devices = allDevices.filter((item) => item.available)
  const cases = useApp((state) => state.cases)
  const launchRows = useApp((state) => state.launchRows)
  const jobs = useApp((state) => state.jobs)
  const env = useApp((state) => state.env)
  const startLaunch = useApp((state) => state.startLaunch)
  const stopLaunch = useApp((state) => state.stopLaunch)
  const setActiveJob = useApp((state) => state.setActiveJob)
  const refreshCases = useApp((state) => state.refreshCases)

  const [caseId, setCaseId] = useState('new')
  const [backend, setBackend] = useState<'official' | 'clover'>('official')
  const [instanceId, setInstanceId] = useState('')
  const [deviceId, setDeviceId] = useState('')
  const [profile, setProfile] = useState<'base' | 'dmd8'>(
    env?.recommendation.profile === 'base' ? 'base' : 'dmd8',
  )
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [caseName, setCaseName] = useState('')
  const [port, setPort] = useState('')
  const [extraArgs, setExtraArgs] = useState('')
  const [launching, setLaunching] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [sort, setSort] = useState<'started' | 'name'>('started')

  useEffect(() => {
    if (!instanceId && instances[0]) setInstanceId(instances[0].id)
  }, [instanceId, instances])

  useEffect(() => {
    if (!deviceId && devices[0]) setDeviceId(devices[0].id)
  }, [deviceId, devices])

  const selectedCase = cases.find((item) => item.id === caseId)
  const instance = instances.find((item) => item.id === instanceId)

  useEffect(() => {
    if (!selectedCase) return
    setBackend(selectedCase.backend)
    setInstanceId(selectedCase.instanceId)
    setDeviceId(selectedCase.deviceId)
    setProfile(selectedCase.profile)
    setCaseName(selectedCase.name)
    setPort(selectedCase.port ? String(selectedCase.port) : '')
    setExtraArgs(selectedCase.extraArgs ?? '')
  }, [selectedCase])

  const activeRows = useMemo(() => {
    const rows = launchRows.filter(
      (row) => row.state === 'queued' || row.state === 'starting' || row.state === 'running',
    )
    return rows.sort((a, b) => {
      if (sort === 'name') return a.caseName.localeCompare(b.caseName)
      return (b.startedAt ?? b.queuedAt).localeCompare(a.startedAt ?? a.queuedAt)
    })
  }, [launchRows, sort])

  const runningCount = activeRows.filter((row) => row.state === 'running' || row.state === 'starting').length
  const queuedCount = activeRows.filter((row) => row.state === 'queued').length

  async function launch(): Promise<void> {
    if (!instanceId) {
      toast.push('先创建一个实例，再选择它', 'error')
      return
    }
    if (!deviceId) {
      toast.push('没有可用设备', 'error')
      return
    }
    if (backend === 'clover') {
      toast.push('Clover 常驻后端下一轮接入；这轮先启动官方 Gradio', 'info')
      return
    }
    setLaunching(true)
    try {
      const input: LaunchStartInput = {
        instanceId,
        caseId: selectedCase?.id,
        caseName: caseName || selectedCase?.name,
        backend,
        deviceId,
        profile,
        port: port ? Number(port) : null,
        extraArgs,
      }
      const row = await startLaunch(input)
      toast.push(row.state === 'queued' ? '设备被占用，已排队' : '已启动', 'success')
    } catch (error) {
      toast.push(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setLaunching(false)
    }
  }

  async function saveCase(): Promise<void> {
    if (!instanceId) return
    try {
      await call(Ipc.casesSave, {
        id: selectedCase?.id,
        name: caseName.trim() || `${instance?.name ?? 'MOSS'} · ${backend === 'official' ? '官方' : 'Clover'}`,
        instanceId,
        backend,
        deviceId,
        profile,
        port: port ? Number(port) : null,
        extraArgs,
      })
      await refreshCases()
      toast.push('启动配置已保存', 'success')
      setAdvancedOpen(false)
    } catch (error) {
      toast.push(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  function openTerminal(row: LaunchRow): void {
    if (row.jobId) setActiveJob(row.jobId)
    openWindow('terminal')
  }

  function deviceName(id: string): string {
    return devices.find((item) => item.id === id)?.name ?? id
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="relative z-10 mx-auto flex w-full max-w-[880px] flex-1 flex-col">
      <header className="pt-4">
        <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
          Launcher
        </div>
        <h1 className="mt-1.5 text-[25px] font-semibold leading-tight tracking-[-0.02em]">
          今天想启动哪个 Case？
        </h1>
        <p className="mt-1 max-w-[560px] text-[11.5px] leading-5 text-[var(--color-text-secondary)]">
          选好后端、实例与设备，在底部启动。运行中的 Case 会像任务表一样收在启动条上方。
        </p>
      </header>

      <div className="min-h-[18vh] flex-1" />

      <section className="mb-12 overflow-hidden rounded-[6px] border border-[var(--color-border-subtle)] bg-white/[0.025]">
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className="flex h-10 w-full items-center gap-2 px-3 text-left hover:bg-white/[0.025]"
          >
            <ListChecks className="size-3.5 text-[var(--color-text-tertiary)]" />
            <span className="text-[11px] font-medium">运行中的 Case</span>
            <span className="text-[9.5px] text-[var(--color-text-tertiary)]">
              {runningCount} 进行中 · {queuedCount} 待处理
            </span>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                setSort((value) => (value === 'started' ? 'name' : 'started'))
              }}
              className="ml-auto inline-flex items-center gap-1 text-[9px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
            >
              {sort === 'started' ? '启动时间' : '名称'}
            </button>
            <ChevronDown
              className={cn('ml-0.5 size-4 text-[var(--color-text-tertiary)] transition-transform', collapsed && '-rotate-90')}
            />
          </button>

          {!collapsed && activeRows.length > 0 ? (
            <div className="border-t border-[var(--color-border-subtle)]">
              {activeRows.map((row) => {
                const running = row.state === 'running' || row.state === 'starting'
                const queued = row.state === 'queued'
                const job = jobs.find((item) => item.id === row.jobId)
                return (
                  <div
                    key={row.id}
                    className="flex h-11 items-center gap-2 border-b border-[var(--color-border-subtle)] px-3 last:border-0"
                  >
                    <span
                      className={cn(
                        'size-1.5 shrink-0 rounded-full',
                        queued ? 'bg-neutral-500' : running ? 'bg-accent-400' : 'bg-red-400',
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="truncate text-[10.5px] font-medium">{row.caseName}</span>
                        <span className="shrink-0 text-[9px] text-[var(--color-text-tertiary)]">
                          {stateLabel[row.state]}
                        </span>
                      </div>
                      <div className="truncate text-[9px] text-[var(--color-text-tertiary)]">
                        {row.instanceName} · {deviceName(row.deviceId)}
                        {job?.url ? ' · 已就绪' : ''}
                      </div>
                    </div>
                    {row.state === 'running' && job?.progress.percent ? (
                      <div className="hidden w-16 shrink-0 sm:block">
                        <div className="h-px overflow-hidden rounded-full bg-white/[0.08]">
                          <div className="h-full bg-accent-500" style={{ width: `${job.progress.percent}%` }} />
                        </div>
                      </div>
                    ) : null}
                    <div className="flex shrink-0 items-center gap-0.5">
                      {job?.url ? (
                        <IconButton
                          label="打开界面"
                          className="size-6"
                          onClick={() => void call(Ipc.openExternal, { url: job.url! })}
                        >
                          <ExternalLink className="size-3" />
                        </IconButton>
                      ) : null}
                      <IconButton
                        label="终端"
                        className="size-6"
                        onClick={() => openTerminal(row)}
                        disabled={!row.jobId}
                      >
                        <SquareTerminal className="size-3" />
                      </IconButton>
                      <IconButton
                        label={queued ? '取消排队' : '停止'}
                        className="size-6 text-red-300 hover:bg-red-500/10"
                        onClick={() => void stopLaunch(row.id)}
                      >
                        <Square className="size-2.5" />
                      </IconButton>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : null}
      </section>

      <div className="sticky bottom-0 z-20 mt-3">
        {advancedOpen ? (
          <div className="glass-strong absolute bottom-[calc(100%+6px)] left-0 right-0 z-20 rounded-[6px] border border-[var(--color-border)] p-3 shadow-2xl">
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Case 名称">
                <input
                  value={caseName}
                  onChange={(event) => setCaseName(event.target.value)}
                  placeholder="例如：日常 1024 / 官方 Gradio"
                  className="h-7 w-[220px] rounded-[4px] border border-[var(--color-border-subtle)] bg-white/[0.04] px-2 text-[10.5px] outline-none focus:border-accent-500/60"
                />
              </Field>
              <Field label="Gradio 端口">
                <input
                  value={port}
                  onChange={(event) => setPort(event.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="自动"
                  className="h-7 w-[90px] rounded-[4px] border border-[var(--color-border-subtle)] bg-white/[0.04] px-2 text-[10.5px] tabular-nums outline-none focus:border-accent-500/60"
                />
              </Field>
              <Field label="额外参数">
                <input
                  value={extraArgs}
                  onChange={(event) => setExtraArgs(event.target.value)}
                  placeholder="--flag value"
                  className="h-7 w-[220px] rounded-[4px] border border-[var(--color-border-subtle)] bg-white/[0.04] px-2 font-mono text-[9.5px] outline-none focus:border-accent-500/60"
                />
              </Field>
              <Button tone="secondary" onClick={() => void saveCase()} disabled={!instanceId}>
                保存为 Case
              </Button>
            </div>
          </div>
        ) : null}

        <div className="glass-strong flex flex-wrap items-end gap-2 rounded-[6px] border border-[var(--color-border)] p-2">
          <Field label="Case">
            <Select
              value={caseId}
              onChange={(value) => {
                setCaseId(value)
                if (value === 'new') setCaseName('')
              }}
              options={[
                { value: 'new', label: '新建配置' },
                ...cases.map((item) => ({ value: item.id, label: item.name })),
              ]}
              className="min-w-[110px]"
            />
          </Field>
          <Field label="后端">
            <Select
              value={backend}
              onChange={(value) => setBackend(value as 'official' | 'clover')}
              options={[
                { value: 'official', label: '官方 Gradio' },
                { value: 'clover', label: 'Clover（下一轮）' },
              ]}
              disabled={Boolean(selectedCase)}
              className="min-w-[92px]"
            />
          </Field>
          <Field label="实例">
            <Select
              value={instanceId}
              onChange={setInstanceId}
              options={
                instances.length === 0
                  ? [{ value: '', label: '没有实例', disabled: true }]
                  : instances.map((item) => ({ value: item.id, label: item.name }))
              }
              disabled={Boolean(selectedCase) || instances.length === 0}
              className="min-w-[140px]"
            />
          </Field>
          <Field label="设备">
            <Select
              value={deviceId}
              onChange={setDeviceId}
              options={devices.map((item) => ({ value: item.id, label: item.name }))}
              disabled={Boolean(selectedCase)}
              className="min-w-[110px]"
            />
          </Field>
          <Field label="档位">
            <Select
              value={profile}
              onChange={(value) => setProfile(value as 'base' | 'dmd8')}
              options={[
                { value: 'dmd8', label: '8 步 DMD' },
                { value: 'base', label: '50 步质量' },
              ]}
              disabled={Boolean(selectedCase)}
              className="min-w-[88px]"
            />
          </Field>

          <div className="ml-auto flex items-center gap-1">
            <IconButton
              label="打开实例设置"
              className="size-7"
              onClick={() => instanceId && navigate(`/instances/${instanceId}`)}
              disabled={!instanceId}
            >
              <Settings2 className="size-3.5" />
            </IconButton>
            <IconButton
              label="高级选项"
              className={cn('size-7', advancedOpen && 'bg-white/[0.07] text-[var(--color-text)]')}
              onClick={() => setAdvancedOpen((value) => !value)}
            >
              <FolderCog className="size-3.5" />
            </IconButton>
            <Button tone="primary" onClick={() => void launch()} disabled={launching || !instanceId || !deviceId}>
              <span className="inline-flex items-center gap-1.5">
                {launching ? <Spinner className="size-3" /> : <Play className="size-3" />}
                {launching ? '启动中' : '启动'}
              </span>
            </Button>
          </div>
        </div>
      </div>

      {instances.length === 0 ? (
        <div className="mt-2 flex items-center justify-between text-[10px] text-[var(--color-text-tertiary)]">
          <span>还没有实例。先创建一个版本实例。</span>
          <Button tone="ghost" onClick={() => navigate('/instances')}>
            创建实例
          </Button>
        </div>
      ) : null}
      </div>
    </div>
  )
}
