import { ArrowLeft, FolderOpen, Package, RefreshCw, ShieldCheck, Terminal, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Ipc } from '@shared/channels'
import type { RuntimeInfo } from '@shared/types'
import { call } from '../lib/api'
import { dateTime, relative } from '../lib/format'
import { useApp } from '../store'
import { Button, Card, EmptyState, Pill, Spinner, StatusDot, useToast } from '../components/ui'

const EMPTY_LOGS: string[] = []

export function InstanceDetailPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const instance = useApp((state) => state.instances.find((item) => item.id === id))
  const logs = useApp((state) => (id ? state.runtimeLogs[id] ?? EMPTY_LOGS : EMPTY_LOGS))
  const refreshInstances = useApp((state) => state.refreshInstances)
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null)
  const [busy, setBusy] = useState<'install' | 'isolate' | null>(null)
  const logRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (!instance) void refreshInstances()
  }, [instance, refreshInstances])

  useEffect(() => {
    if (!id) return
    void call<RuntimeInfo | null>(Ipc.runtimeState, { id })
      .then(setRuntime)
      .catch(() => setRuntime(null))
  }, [id, instance?.runtimeState])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs])

  if (!instance) {
    return (
      <EmptyState
        icon={<Package className="size-7" />}
        title="实例不存在"
        description="它可能已被删除，或者还在加载。"
        action={
          <Button tone="secondary" onClick={() => void refreshInstances()}>
            <RefreshCw className="size-3.5" /> 重新加载
          </Button>
        }
      />
    )
  }

  async function install(): Promise<void> {
    if (!id) return
    setBusy('install')
    try {
      await call(Ipc.runtimeInstall, { instanceId: id })
      await refreshInstances()
      toast.push('依赖安装完成', 'success')
    } catch (error) {
      toast.push(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setBusy(null)
    }
  }

  async function isolate(): Promise<void> {
    if (!id) return
    setBusy('isolate')
    try {
      const result = await call<RuntimeInfo>(Ipc.runtimeIsolate, { id })
      setRuntime(result)
      await refreshInstances()
      toast.push('已转为独立运行时，接下来需要安装依赖', 'success')
    } catch (error) {
      toast.push(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setBusy(null)
    }
  }

  async function remove(): Promise<void> {
    if (!id) return
    try {
      await call(Ipc.instanceDelete, { id, keepOutputs: true })
      await refreshInstances()
      navigate('/instances')
      toast.push('实例已删除', 'success')
    } catch (error) {
      toast.push(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate('/instances')}
          className="inline-flex items-center gap-1.5 text-[12px] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
        >
          <ArrowLeft className="size-3.5" /> 实例
        </button>
        <div className="flex items-center gap-1.5">
          <Button tone="ghost" onClick={() => void call(Ipc.instanceOpen, { id: instance.id })}>
            <span className="inline-flex items-center gap-1.5">
              <FolderOpen className="size-3.5" /> 打开目录
            </span>
          </Button>
          <Button tone="ghost" onClick={() => void remove()}>
            <span className="inline-flex items-center gap-1.5 text-red-500">
              <Trash2 className="size-3.5" /> 删除
            </span>
          </Button>
        </div>
      </div>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[22px] font-semibold tracking-tight">{instance.name}</h1>
            {instance.channel === 'stable' ? <Pill tone="moss">稳定版</Pill> : null}
            {instance.channel === 'experimental' ? <Pill tone="amber">实验</Pill> : null}
            {instance.channel === 'custom' ? <Pill tone="blue">自定义</Pill> : null}
            {instance.dirty ? <Pill tone="amber">有本地改动</Pill> : null}
          </div>
          <p className="mt-1 text-[12px] text-[var(--color-text-tertiary)]">
            {instance.branch} · <span className="font-mono">{instance.shortCommit}</span> · {dateTime(instance.commitDate)}
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11.5px] text-[var(--color-text-secondary)]">
          <StatusDot status={instance.status === 'ok' ? 'ok' : instance.status === 'missing' ? 'error' : 'warn'} />
          {instance.status === 'ok' ? '代码完整' : instance.status === 'missing' ? '代码目录缺失' : '运行时缺失'}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="px-5 py-4">
          <h2 className="text-[13px] font-semibold">版本</h2>
          <dl className="mt-3 space-y-2 text-[11.5px]">
            {[
              ['分支', instance.branch],
              ['提交', instance.commit],
              ['时间', dateTime(instance.commitDate)],
              ['作者', instance.author || '—'],
              ['来源', instance.source],
              ['创建于', relative(instance.createdAt)],
            ].map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-4">
                <dt className="shrink-0 text-[var(--color-text-tertiary)]">{label}</dt>
                <dd className="min-w-0 truncate text-right font-mono text-[11px]">{value}</dd>
              </div>
            ))}
          </dl>
          {instance.subject ? (
            <p className="mt-3 rounded-lg bg-[var(--color-surface-secondary)] px-3 py-2 text-[11.5px] leading-5 text-[var(--color-text-secondary)]">
              {instance.subject}
            </p>
          ) : null}
        </Card>

        <Card className="px-5 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-semibold">运行时</h2>
            <Pill tone={runtime?.state === 'ready' ? 'moss' : runtime?.state === 'error' ? 'red' : 'amber'}>
              {runtime?.state === 'ready'
                ? '就绪'
                : runtime?.state === 'error'
                  ? '异常'
                  : runtime?.state === 'installing'
                    ? '安装中'
                    : '待安装'}
            </Pill>
          </div>
          {runtime ? (
            <dl className="mt-3 space-y-2 text-[11.5px]">
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--color-text-tertiary)]">Python</dt>
                <dd className="font-mono">{runtime.pythonVersion}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--color-text-tertiary)]">模式</dt>
                <dd>{runtime.kind === 'shared' ? '共享' : '独立'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--color-text-tertiary)]">依赖</dt>
                <dd>{runtime.deps.length} 个</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--color-text-tertiary)]">锁</dt>
                <dd className="font-mono">{runtime.lockHash.slice(0, 10)}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-[11.5px] text-[var(--color-text-tertiary)]">运行时记录缺失，可重建实例。</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button tone="primary" size="sm" disabled={busy !== null} onClick={() => void install()}>
              {busy === 'install' ? <Spinner className="size-3.5" /> : runtime?.state === 'ready' ? '重新安装依赖' : '安装依赖'}
            </Button>
            {runtime?.kind === 'shared' ? (
              <Button tone="secondary" size="sm" disabled={busy !== null} onClick={() => void isolate()}>
                {busy === 'isolate' ? <Spinner className="size-3.5" /> : '转为独立'}
              </Button>
            ) : null}
          </div>
          <p className="mt-2 text-[10.5px] leading-4 text-[var(--color-text-tertiary)]">
            依赖安装会下载 torch / diffusers / transformers，macOS 约 1–2 GB，CUDA 环境更大。
          </p>
        </Card>
      </div>

      <Card className="px-5 py-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold">模型与适配器</h2>
          <Button tone="ghost" onClick={() => navigate('/models')}>
            管理模型
          </Button>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(['DiT', '文本编码器', 'VAE'] as const).map((label) => (
            <div
              key={label}
              className="rounded-lg border border-dashed border-[var(--color-border)] px-3 py-3 text-center"
            >
              <div className="text-[11.5px] font-medium">{label}</div>
              <div className="mt-1 text-[10.5px] text-[var(--color-text-tertiary)]">未绑定</div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10.5px] text-[var(--color-text-tertiary)]">
          模型绑定与适配器启用会在 M3 完成；当前可先在模型页下载。
        </p>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-4 py-2.5">
          <div className="flex items-center gap-2 text-[12.5px] font-medium">
            <Terminal className="size-3.5" /> 运行时输出
          </div>
          <span className="text-[10.5px] text-[var(--color-text-tertiary)]">{logs.length} 行</span>
        </div>
        <pre
          ref={logRef}
          className="h-48 overflow-y-auto bg-[var(--color-surface-secondary)] px-4 py-3 font-mono text-[10.5px] leading-5 text-[var(--color-text-secondary)]"
        >
          {logs.length ? logs.join('\n') : '尚无输出。安装依赖或启动实例后，日志会出现在这里。'}
        </pre>
      </Card>

      <div className="flex items-center gap-2 text-[10.5px] text-[var(--color-text-tertiary)]">
        <ShieldCheck className="size-3.5" />
        实例固定到 commit；回滚只需切换 pin，不重新下载权重。
      </div>
    </div>
  )
}
