import {
  ChevronDown,
  Cpu,
  ExternalLink,
  FolderCog,
  ListChecks,
  Play,
  Settings2,
  SlidersHorizontal,
  Square,
  SquareTerminal,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Events, Ipc } from '@shared/channels'
import type {
  GradioLaunchConfig,
  JobRecord,
  LaunchCase,
  LaunchRow,
  LaunchStartInput,
  ManagedHost,
  WorkspaceKind,
} from '@shared/types'
import {
  GRADIO_LISTEN_LABELS,
  GRADIO_OPEN_LABELS,
  createDefaultGradioConfig,
  gradioSummary,
  normalizeGradioConfig,
} from '@shared/launch'
import { call, onEvent } from '../lib/api'
import { openGradioUi } from '../lib/openGradio'
import { openWindow } from '../lib/windows'
import { useApp } from '../store'
import { GradioSettingsSheet } from '../components/GradioSettingsSheet'
import { Collapse, Presence } from '../components/motion'
import { Button, Field, IconButton, Input, Pill, Select, Spinner, cn, useToast } from '../components/ui'

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
  const cases = useApp((state) => state.cases)
  const launchRows = useApp((state) => state.launchRows)
  const jobs = useApp((state) => state.jobs)
  const env = useApp((state) => state.env)
  const homeCopy = useApp((state) => state.updates?.home)
  const startLaunch = useApp((state) => state.startLaunch)
  const stopLaunch = useApp((state) => state.stopLaunch)
  const setActiveJob = useApp((state) => state.setActiveJob)
  const refreshCases = useApp((state) => state.refreshCases)

  const [caseId, setCaseId] = useState('new')
  const [workspace, setWorkspace] = useState<WorkspaceKind>('official')
  const [instanceId, setInstanceId] = useState('')
  const [deviceId, setDeviceId] = useState('')
  const [remoteHosts, setRemoteHosts] = useState<ManagedHost[]>([])
  const [profile, setProfile] = useState<'base' | 'dmd8'>(
    env?.recommendation.profile === 'base' ? 'base' : 'dmd8',
  )
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [gradioOpen, setGradioOpen] = useState(false)
  const [gradio, setGradio] = useState<GradioLaunchConfig>(() => createDefaultGradioConfig())
  const [caseName, setCaseName] = useState('')
  const [launching, setLaunching] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [sort, setSort] = useState<'started' | 'name'>('started')

  const selectedCase = cases.find((item) => item.id === caseId)
  const instance = instances.find((item) => item.id === instanceId)
  const devices = useMemo(() => {
    const placement = instance?.placement
    if (placement?.kind === 'ssh') {
      const host = remoteHosts.find((item) => item.id === placement.hostId)
      return (host?.devices ?? []).filter((item) => item.available)
    }
    return allDevices.filter((item) => item.available)
  }, [allDevices, instance, remoteHosts])

  useEffect(() => {
    if (!instanceId && instances[0]) setInstanceId(instances[0].id)
  }, [instanceId, instances])

  useEffect(() => {
    void call<ManagedHost[]>(Ipc.hostsList)
      .then(setRemoteHosts)
      .catch(() => undefined)
  }, [instance?.placement.kind === 'ssh' ? instance.placement.hostId : 'local'])

  useEffect(
    () =>
      onEvent(Events.hostsChanged, () => {
        void call<ManagedHost[]>(Ipc.hostsList)
          .then(setRemoteHosts)
          .catch(() => undefined)
      }),
    [],
  )

  useEffect(() => {
    if (!devices.some((item) => item.id === deviceId)) setDeviceId(devices[0]?.id ?? '')
  }, [deviceId, devices])

  useEffect(() => {
    if (!selectedCase) return
    setWorkspace(selectedCase.workspace)
    setInstanceId(selectedCase.instanceId)
    setDeviceId(selectedCase.deviceId)
    setProfile(selectedCase.profile)
    setCaseName(selectedCase.name)
    setGradio(normalizeGradioConfig(selectedCase.gradio))
    setGradioOpen(false)
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
  const gradioSummaryText = useMemo(() => gradioSummary(gradio), [gradio])
  const gradioOpenText = useMemo(
    () =>
      `${GRADIO_OPEN_LABELS[gradio.openMode]}${gradio.listen === 'lan' ? ` · ${GRADIO_LISTEN_LABELS.lan}` : ''}`,
    [gradio],
  )

  async function launch(): Promise<void> {
    if (!instanceId) {
      toast.push('先创建一个实例，再选择它', 'error')
      return
    }
    if (!deviceId) {
      toast.push('没有可用设备', 'error')
      return
    }
    if (workspace === 'clover') {
      toast.push('Clover 创作工作台暂未开放，请改用官方 Gradio。', 'info')
      return
    }
    setLaunching(true)
    try {
      const input: LaunchStartInput = {
        instanceId,
        caseId: selectedCase?.id,
        caseName: caseName || selectedCase?.name,
        workspace,
        deviceId,
        profile,
        gradio: workspace === 'official' ? normalizeGradioConfig(gradio) : undefined,
      }
      const row = await startLaunch(input)
      setGradioOpen(false)
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
      const saved = await call<LaunchCase>(Ipc.casesSave, {
        id: selectedCase?.id,
        name:
          caseName.trim() ||
          `${instance?.name ?? 'MOSS'} · ${workspace === 'official' ? '官方' : 'Clover'}`,
        instanceId,
        workspace,
        deviceId,
        profile,
        gradio: workspace === 'official' ? normalizeGradioConfig(gradio) : undefined,
      })
      await refreshCases()
      setCaseId(saved.id)
      toast.push('启动配置已保存', 'success')
      setAdvancedOpen(false)
    } catch (error) {
      toast.push(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  function chooseCase(value: string): void {
    setCaseId(value)
    if (value !== 'new') return
    setCaseName('')
    setWorkspace('official')
    setGradio(createDefaultGradioConfig())
    setAdvancedOpen(false)
    setGradioOpen(false)
    setInstanceId(instances[0]?.id ?? '')
    setDeviceId(devices[0]?.id ?? '')
    setProfile(env?.recommendation.profile === 'base' ? 'base' : 'dmd8')
  }

  function openGradioInterface(
    url: string,
    mode: GradioLaunchConfig['openMode'] = 'browser',
    title?: string,
  ): void {
    void openGradioUi(url, mode, title)
      .then((result) => {
        if (result === 'copied') toast.push('Gradio 地址已复制', 'success')
      })
      .catch((error: unknown) =>
        toast.push(error instanceof Error ? error.message : String(error), 'error'),
      )
  }

  function openTerminal(row: LaunchRow): void {
    if (row.jobId) setActiveJob(row.jobId)
    openWindow('terminal')
  }

  function deviceName(id: string): string {
    return devices.find((item) => item.id === id)?.name ?? id
  }

  function rowJob(row: LaunchRow): JobRecord | undefined {
    return jobs.find((item) => item.id === row.jobId)
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="relative z-10 mx-auto flex w-full max-w-[880px] flex-1 flex-col">
      <header className="pt-4">
        <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
          当前篇章 · {homeCopy?.chapter ?? '万象初绘'}
        </div>
        <h1 className="mt-1.5 text-[25px] font-semibold leading-tight tracking-[-0.02em]">
          {homeCopy?.title ?? '一念落纸上，万象入画来。'}
        </h1>
        <p className="mt-1 max-w-[560px] text-[11.5px] leading-5 text-[var(--color-text-secondary)]">
          {homeCopy?.subtitle ?? '选好工作台、实例与设备，开始今天的创作。'}
        </p>
      </header>

      <div className="min-h-[18vh] flex-1" />

      <section className="glass-strong mb-12 overflow-hidden rounded-[6px] border border-[var(--color-border-subtle)]">
        <div className="flex h-10 items-center gap-2 px-3">
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-expanded={!collapsed}
            aria-controls="launch-stack"
            className="flex h-full min-w-0 flex-1 items-center gap-2 text-left hover:bg-white/[0.025]"
          >
            <ListChecks className="size-3.5 text-[var(--color-text-tertiary)]" />
            <span className="text-[11px] font-medium">运行中的 Case</span>
            <span className="text-[9.5px] text-[var(--color-text-tertiary)]">
              {runningCount} 进行中 · {queuedCount} 待处理
            </span>
            <ChevronDown
              className={cn('ml-auto size-4 shrink-0 text-[var(--color-text-tertiary)] transition-transform', collapsed && '-rotate-90')}
            />
          </button>
          <button
            type="button"
            onClick={() => setSort((value) => (value === 'started' ? 'name' : 'started'))}
            aria-label={`排序：${sort === 'started' ? '启动时间' : '名称'}，点击切换`}
            className="inline-flex h-full shrink-0 items-center text-[9px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
          >
            {sort === 'started' ? '启动时间' : '名称'}
          </button>
        </div>

        <Collapse id="launch-stack" open={!collapsed && activeRows.length > 0}>
          <div className="border-t border-[var(--color-border-subtle)]">
            {activeRows.map((row) => {
              const running = row.state === 'running' || row.state === 'starting'
              const queued = row.state === 'queued'
              const job = rowJob(row)
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
                        onClick={() =>
                          openGradioInterface(
                            job.url!,
                            job.gradio?.openMode ?? 'browser',
                            job.caseName,
                          )
                        }
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
        </Collapse>
      </section>

      <div className="sticky bottom-0 z-20 mt-3">
        <Presence open={advancedOpen} preset="flyout" className="app-popover glass-strong absolute bottom-[calc(100%+6px)] left-0 right-0 z-20 border border-[var(--color-border)] p-3 shadow-2xl">
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Case 名称">
              <Input
                value={caseName}
                onChange={(event) => setCaseName(event.target.value)}
                placeholder="例如：日常 1024 / 官方 Gradio"
                className="w-[240px]"
              />
            </Field>
            <Button tone="secondary" onClick={() => void saveCase()} disabled={!instanceId}>
              {selectedCase ? '保存 Case' : '保存为 Case'}
            </Button>
            <p className="w-full text-[9px] leading-4 text-[var(--color-text-tertiary)]">
              Gradio 的启动参数在启动条上的「Gradio」按钮里配置；这里只管理 Case 本身。
            </p>
          </div>
        </Presence>

        <div className="glass-strong flex flex-wrap items-end gap-2 rounded-[6px] border border-[var(--color-border)] p-2">
          <Field label="Case" className="w-[110px]">
            <Select
              value={caseId}
              onValueChange={chooseCase}
              options={[
                { value: 'new', label: '新建配置' },
                ...cases.map((item) => ({ value: item.id, label: item.name })),
              ]}
            />
          </Field>
          <Field label="工作台" className="w-[112px]">
            <Select
              value={workspace}
              onValueChange={(value) => setWorkspace(value as WorkspaceKind)}
              options={[
                { value: 'official', label: '官方 Gradio' },
                { value: 'clover', label: 'Clover（暂未开放）', disabled: true },
              ]}
            />
          </Field>
          <Field label="实例" className="w-[140px]">
            <Select
              value={instanceId}
              onValueChange={setInstanceId}
              options={
                instances.length === 0
                  ? [{ value: '', label: '没有实例', disabled: true }]
                  : instances.map((item) => ({ value: item.id, label: item.name }))
              }
              disabled={instances.length === 0}
            />
          </Field>
          <Field label="设备" className="w-[110px]">
            <Select
              value={deviceId}
              onValueChange={setDeviceId}
              options={
                devices.length > 0
                  ? devices.map((item) => {
                      const host =
                        item.hostId && item.hostId !== 'local'
                          ? remoteHosts.find((entry) => entry.id === item.hostId)?.name
                          : undefined
                      return { value: item.id, label: host ? `${item.name} · ${host}` : item.name }
                    })
                  : [
                      {
                        value: '',
                        label:
                          instance?.placement.kind === 'ssh'
                            ? '远端无可用设备（先测试连接）'
                            : '没有可用设备',
                        disabled: true,
                      },
                    ]
              }
            />
          </Field>
          {workspace === 'official' ? (
            <Field id="gradio-launch-settings" label="Gradio">
              <button
                id="gradio-launch-settings"
                type="button"
                aria-label="Gradio 启动参数"
                onClick={() => setGradioOpen(true)}
                title={`${gradioSummaryText} · ${gradioOpenText}`}
                className={cn(
                  'app-input',
                  'flex w-full min-w-[178px] max-w-[224px] items-center gap-1.5',
                )}
              >
                <SlidersHorizontal className="size-3.5 shrink-0 text-[var(--color-text-tertiary)]" />
                <span className="flex min-w-0 flex-1 flex-col text-left leading-tight">
                  <span className="truncate text-[10.5px] leading-[13px]">{gradioSummaryText}</span>
                  <span className="truncate text-[8px] leading-[10px] text-[var(--color-text-tertiary)]">
                    {gradioOpenText}
                  </span>
                </span>
              </button>
            </Field>
          ) : (
            <Field label="档位" className="w-[88px]">
              <Select
                value={profile}
                onValueChange={(value) => setProfile(value as 'base' | 'dmd8')}
                options={[
                  { value: 'dmd8', label: '8 步 DMD' },
                  { value: 'base', label: '50 步质量' },
                ]}
              />
            </Field>
          )}

          <div className="ml-auto flex items-center gap-1">
            <IconButton
              label="设备管理器"
              className="size-7"
              onClick={() => openWindow('devices')}
            >
              <Cpu className="size-3.5" />
            </IconButton>
            <IconButton
              label="打开实例设置"
              className="size-7"
              onClick={() => instanceId && navigate(`/instances/${instanceId}`)}
              disabled={!instanceId}
            >
              <Settings2 className="size-3.5" />
            </IconButton>
            <IconButton
              label="Case 设置"
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

      <GradioSettingsSheet
        open={gradioOpen}
        value={gradio}
        remote={instance?.placement.kind === 'ssh'}
        onClose={() => setGradioOpen(false)}
        onApply={(next) => {
          setGradio(next)
          toast.push('Gradio 参数已应用到当前启动条', 'success')
        }}
      />

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
