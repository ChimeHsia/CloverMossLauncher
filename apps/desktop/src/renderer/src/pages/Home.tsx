import {
  ChevronDown,
  CircleDot,
  ExternalLink,
  FolderCog,
  Layers3,
  Play,
  Settings2,
  Square,
  SquareTerminal,
  Wand2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Ipc } from '@shared/channels'
import type { LaunchCase, LaunchRow, LaunchStartInput } from '@shared/types'
import { call } from '../lib/api'
import { openWindow } from '../lib/windows'
import { useApp } from '../store'
import { Button, Card, IconButton, Pill, Spinner, cn, useToast } from '../components/ui'

function Field({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-tertiary)]">
        {label}
      </span>
      {children}
    </label>
  )
}

function Select({
  value,
  onChange,
  children,
  disabled,
  className,
}: {
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
  disabled?: boolean
  className?: string
}): React.JSX.Element {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        'h-8 max-w-full rounded-[5px] border border-[var(--color-border-subtle)] bg-white/[0.045] px-2 text-[11.5px] text-[var(--color-text)] outline-none transition',
        'hover:border-[var(--color-border)] focus:border-accent-500/60 focus:ring-1 focus:ring-accent-500/20',
        'disabled:cursor-default disabled:opacity-55',
        className,
      )}
    >
      {children}
    </select>
  )
}

const stateLabel: Record<LaunchRow['state'], string> = {
  queued: '排队中',
  starting: '启动中',
  running: '运行中',
  stopped: '已停止',
  failed: '失败',
}

const stateTone: Record<LaunchRow['state'], 'neutral' | 'accent' | 'amber' | 'red'> = {
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
  const devices = useApp((state) => state.devices)
  const cases = useApp((state) => state.cases)
  const launchRows = useApp((state) => state.launchRows)
  const env = useApp((state) => state.env)
  const startLaunch = useApp((state) => state.startLaunch)
  const stopLaunch = useApp((state) => state.stopLaunch)
  const setActiveJob = useApp((state) => state.setActiveJob)
  const refreshCases = useApp((state) => state.refreshCases)
  const notificationsOpen = useApp((state) => state.notificationsOpen)

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
  const device = devices.find((item) => item.id === deviceId)

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
    const rows = launchRows.filter((row) => row.state === 'queued' || row.state === 'starting' || row.state === 'running')
    return rows.sort((a, b) => {
      if (sort === 'name') return a.caseName.localeCompare(b.caseName)
      return (b.startedAt ?? b.queuedAt).localeCompare(a.startedAt ?? a.queuedAt)
    })
  }, [launchRows, sort])

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
      if (row.state === 'queued') {
        toast.push(`设备被占用，已排队：${row.caseName}`, 'info')
      } else {
        toast.push(`已启动 ${row.caseName}`, 'success')
      }
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

  return (
    <div className={cn('pb-16 transition-[padding] duration-200', notificationsOpen && 'pr-[352px]')}>
      <header className="pt-4">
        <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
          <CircleDot className="size-3 text-accent-300" />
          Launcher
        </div>
        <h1 className="mt-2 text-[26px] font-semibold leading-tight tracking-[-0.02em]">
          今天想启动哪个 Case？
        </h1>
        <p className="mt-1.5 max-w-[560px] text-[12px] leading-5 text-[var(--color-text-secondary)]">
          选择后端、实例与设备，启动官方 Gradio 或你自己的 Clover Case；运行中的任务会收在下面。
        </p>
      </header>

      <Card className="relative mt-6 p-4">
        <div className="flex flex-wrap items-end gap-2.5">
          <Field label="Case" className="min-w-[130px]">
            <Select
              value={caseId}
              onChange={(value) => {
                setCaseId(value)
                if (value === 'new') setCaseName('')
              }}
            >
              <option value="new">新建启动配置</option>
              {cases.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="后端" className="min-w-[105px]">
            <Select
              value={backend}
              onChange={(value) => setBackend(value as 'official' | 'clover')}
              disabled={Boolean(selectedCase)}
            >
              <option value="official">官方 Gradio</option>
              <option value="clover">Clover Case（下一轮）</option>
            </Select>
          </Field>

          <Field label="实例" className="min-w-[150px]">
            <Select
              value={instanceId}
              onChange={setInstanceId}
              disabled={Boolean(selectedCase) || instances.length === 0}
            >
              {instances.length === 0 ? <option value="">没有实例</option> : null}
              {instances.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="设备" className="min-w-[130px]">
            <Select value={deviceId} onChange={setDeviceId} disabled={Boolean(selectedCase)}>
              {devices.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="档位" className="min-w-[100px]">
            <Select
              value={profile}
              onChange={(value) => setProfile(value as 'base' | 'dmd8')}
              disabled={Boolean(selectedCase)}
            >
              <option value="dmd8">8 步 DMD</option>
              <option value="base">50 步质量</option>
            </Select>
          </Field>

          <div className="ml-auto flex items-center gap-1">
            <IconButton
              label="打开实例设置"
              className="size-8"
              onClick={() => instanceId && navigate(`/instances/${instanceId}`)}
              disabled={!instanceId}
            >
              <Settings2 className="size-3.5" />
            </IconButton>
            <IconButton
              label="高级选项"
              className={cn('size-8', advancedOpen && 'bg-white/[0.07] text-[var(--color-text)]')}
              onClick={() => setAdvancedOpen((value) => !value)}
            >
              <FolderCog className="size-3.5" />
            </IconButton>
            <Button tone="primary" onClick={() => void launch()} disabled={launching || !instanceId || !deviceId}>
              <span className="inline-flex items-center gap-1.5">
                {launching ? <Spinner className="size-3.5" /> : <Play className="size-3.5" />}
                {launching ? '启动中' : '启动'}
              </span>
            </Button>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9.5px] text-[var(--color-text-tertiary)]">
          <span>{device ? `${device.name} · ${device.detail}` : '没有可用设备'}</span>
          {instance ? <span>固定 {instance.shortCommit}</span> : null}
          {env ? <span>推荐 {env.recommendation.width}² · {env.recommendation.steps} 步</span> : null}
          <span className="ml-auto">新的启动条会永远置顶，运行中的 Case 收在下面。</span>
        </div>

        {advancedOpen ? (
          <div className="mt-3 border-t border-[var(--color-border-subtle)] pt-3">
            <div className="flex flex-wrap items-end gap-2.5">
              <Field label="Case 名称" className="min-w-[180px] flex-1">
                <input
                  value={caseName}
                  onChange={(event) => setCaseName(event.target.value)}
                  placeholder="例如：日常 1024 / 官方 Gradio"
                  className="h-8 w-full rounded-[5px] border border-[var(--color-border-subtle)] bg-white/[0.045] px-2 text-[11.5px] outline-none focus:border-accent-500/60"
                />
              </Field>
              <Field label="Gradio 端口（可空）" className="w-[130px]">
                <input
                  value={port}
                  onChange={(event) => setPort(event.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="自动"
                  className="h-8 w-full rounded-[5px] border border-[var(--color-border-subtle)] bg-white/[0.045] px-2 text-[11.5px] tabular-nums outline-none focus:border-accent-500/60"
                />
              </Field>
              <Field label="额外参数" className="min-w-[180px] flex-[2]">
                <input
                  value={extraArgs}
                  onChange={(event) => setExtraArgs(event.target.value)}
                  placeholder="--flag value"
                  className="h-8 w-full rounded-[5px] border border-[var(--color-border-subtle)] bg-white/[0.045] px-2 font-mono text-[10.5px] outline-none focus:border-accent-500/60"
                />
              </Field>
              <Button tone="secondary" onClick={() => void saveCase()} disabled={!instanceId}>
                保存为 Case
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
        >
          <ChevronDown className={cn('size-3.5 transition-transform', collapsed && '-rotate-90')} />
          运行中的 Case
          <span className="text-[var(--color-text-tertiary)]">{activeRows.length}</span>
        </button>
        <div className="flex items-center gap-1.5">
          <span className="text-[9.5px] text-[var(--color-text-tertiary)]">排序</span>
          <Select value={sort} onChange={(value) => setSort(value as 'started' | 'name')} className="h-7 text-[10.5px]">
            <option value="started">启动时间</option>
            <option value="name">名称</option>
          </Select>
        </div>
      </div>

      {!collapsed ? (
        <div className="mt-2 space-y-1.5">
          {activeRows.length === 0 ? (
            <div className="rounded-[8px] border border-dashed border-[var(--color-border-subtle)] px-4 py-8 text-center text-[11px] text-[var(--color-text-tertiary)]">
              还没有运行中的 Case。上面的启动条会一直留在这里。
            </div>
          ) : (
            activeRows.map((row) => {
              const running = row.state === 'running' || row.state === 'starting'
              const queued = row.state === 'queued'
              const job = useApp.getState().jobs.find((item) => item.id === row.jobId)
              return (
                <div
                  key={row.id}
                  className="glass flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[7px] px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[11.5px] font-medium">{row.caseName}</span>
                      <Pill tone={stateTone[row.state]}>{stateLabel[row.state]}</Pill>
                      {row.state === 'queued' ? (
                        <span className="text-[9px] text-[var(--color-text-tertiary)]">等待设备</span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[9.5px] text-[var(--color-text-tertiary)]">
                      <span>{row.instanceName}</span>
                      <span>{row.backend === 'official' ? '官方 Gradio' : 'Clover Case'}</span>
                      <span>{devices.find((item) => item.id === row.deviceId)?.name ?? row.deviceId}</span>
                      <span>{row.profile === 'dmd8' ? '8 步 DMD' : '50 步质量'}</span>
                      {row.error ? <span className="text-red-300">{row.error}</span> : null}
                    </div>
                  </div>

                  {row.state === 'running' && job?.progress.percent ? (
                    <div className="hidden w-28 shrink-0 sm:block">
                      <div className="h-[3px] overflow-hidden rounded-full bg-white/[0.08]">
                        <div className="h-full bg-accent-500" style={{ width: `${job.progress.percent}%` }} />
                      </div>
                      <div className="mt-1 text-right text-[8.5px] tabular-nums text-[var(--color-text-tertiary)]">
                        {Math.round(job.progress.percent)}%
                      </div>
                    </div>
                  ) : null}

                  <div className="ml-auto flex items-center gap-1">
                    {job?.url ? (
                      <Button
                        tone="secondary"
                        onClick={() => void call(Ipc.openExternal, { url: job.url! })}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <ExternalLink className="size-3" /> 打开界面
                        </span>
                      </Button>
                    ) : null}
                    <Button tone="secondary" className={!row.jobId ? 'opacity-40' : undefined} onClick={() => openTerminal(row)} disabled={!row.jobId}>
                      <span className="inline-flex items-center gap-1.5">
                        <SquareTerminal className="size-3" /> 终端
                      </span>
                    </Button>
                    {running || queued ? (
                      <Button tone="ghost" onClick={() => void stopLaunch(row.id)}>
                        <span className="inline-flex items-center gap-1.5 text-red-300">
                          <Square className="size-3" /> {queued ? '取消' : '停止'}
                        </span>
                      </Button>
                    ) : null}
                  </div>
                </div>
              )
            })
          )}
        </div>
      ) : null}

      <div className="mt-8 flex items-center gap-2 text-[9.5px] text-[var(--color-text-tertiary)]">
        <Layers3 className="size-3" />
        创作窗口负责 JSON、画布与图层；启动器只负责启动与监视。
        <button
          type="button"
          onClick={() => openWindow('creator')}
          className="ml-1 inline-flex items-center gap-1 text-accent-300 hover:underline"
        >
          <Wand2 className="size-3" /> 打开创作窗口
        </button>
      </div>

      {instances.length === 0 ? (
        <div className="mt-6 flex items-center justify-between rounded-[8px] border border-[var(--color-border-subtle)] px-4 py-3">
          <p className="text-[11px] text-[var(--color-text-secondary)]">还没有实例。先创建一个版本实例，再回来启动。</p>
          <Button tone="primary" onClick={() => navigate('/instances')}>
            创建实例
          </Button>
        </div>
      ) : null}
    </div>
  )
}
