import {
  Cpu,
  FolderCog,
  Play,
  Settings2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Events, Ipc } from '@shared/channels'
import type {
  LaunchCase,
  ManagedHost,
} from '@shared/types'
import { call, onEvent } from '../lib/api'
import { openWindow } from '../lib/windows'
import { useApp } from '../store'
import { Presence } from '../components/motion'
import { Button, Field, IconButton, Input, Select, cn, useToast } from '../components/ui'

export function HomePage(): React.JSX.Element {
  const navigate = useNavigate()
  const toast = useToast()
  const instances = useApp((state) => state.instances)
  const allDevices = useApp((state) => state.devices)
  const cases = useApp((state) => state.cases)
  const env = useApp((state) => state.env)
  const homeCopy = useApp((state) => state.updates?.home)
  const refreshCases = useApp((state) => state.refreshCases)

  const [caseId, setCaseId] = useState('new')
  const [instanceId, setInstanceId] = useState('')
  const [deviceId, setDeviceId] = useState('')
  const [remoteHosts, setRemoteHosts] = useState<ManagedHost[]>([])
  const [profile, setProfile] = useState<'base' | 'dmd8'>(
    env?.recommendation.profile === 'base' ? 'base' : 'dmd8',
  )
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [caseName, setCaseName] = useState('')

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
    setInstanceId(selectedCase.instanceId)
    setDeviceId(selectedCase.deviceId)
    setProfile(selectedCase.profile)
    setCaseName(selectedCase.name)
  }, [selectedCase])

  async function launch(): Promise<void> {
    if (!instanceId) {
      toast.push('先创建一个实例，再选择它', 'error')
      return
    }
    if (!deviceId) {
      toast.push('没有可用设备', 'error')
      return
    }
    useApp.getState().setStudioInstanceId(instanceId)
    openWindow('creator')
    toast.push('MossStudio 已打开', 'success')
  }

  async function saveCase(): Promise<void> {
    if (!instanceId) return
    try {
      const saved = await call<LaunchCase>(Ipc.casesSave, {
        id: selectedCase?.id,
        name:
          caseName.trim() ||
          `${instance?.name ?? 'MOSS'} · MossStudio`,
        instanceId,
        workspace: 'clover',
        deviceId,
        profile,
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
    setAdvancedOpen(false)
    setInstanceId(instances[0]?.id ?? '')
    setDeviceId(devices[0]?.id ?? '')
    setProfile(env?.recommendation.profile === 'base' ? 'base' : 'dmd8')
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
          {homeCopy?.subtitle ?? '选好实例与设备，打开 MossStudio 开始创作。'}
        </p>
      </header>

      <div className="min-h-[18vh] flex-1" />

      <div className="sticky bottom-0 z-20 mt-3">
        <Presence open={advancedOpen} preset="flyout" className="app-popover glass-strong absolute bottom-[calc(100%+6px)] left-0 right-0 z-20 border border-[var(--color-border)] p-3 shadow-2xl">
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Case 名称">
              <Input
                value={caseName}
                onChange={(event) => setCaseName(event.target.value)}
                placeholder="例如：日常 1024 / MossStudio"
                className="w-[240px]"
              />
            </Field>
            <Button tone="secondary" onClick={() => void saveCase()} disabled={!instanceId}>
              {selectedCase ? '保存 Case' : '保存为 Case'}
            </Button>
            <p className="w-full text-[9px] leading-4 text-[var(--color-text-tertiary)]">
              MossStudio 是唯一创作入口；Case 只保存实例、设备和档位。
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
            <Button tone="primary" onClick={() => void launch()} disabled={!instanceId || !deviceId}>
              <span className="inline-flex items-center gap-1.5">
                <Play className="size-3" />
                打开 MossStudio
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
