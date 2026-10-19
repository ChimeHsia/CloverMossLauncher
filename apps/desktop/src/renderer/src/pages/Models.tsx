import { Download, HardDrive, Package, Pause, Play, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { AdapterEntry, DownloadTask, ModelEntry } from '@shared/types'
import { bytes, percent } from '../lib/format'
import { t } from '../lib/i18n'
import { useApp } from '../store'
import { MotionPanel } from '../components/motion'
import {
  Button,
  Card,
  EmptyState,
  IconButton,
  Modal,
  Pill,
  ProgressBar,
  Spinner,
  cn,
  useToast,
} from '../components/ui'

type Tab = 'all' | 'installed' | 'downloading'
type Pending = {
  kind: 'model' | 'adapter'
  id: string
  name: string
  sizeBytes: number
  repo: string
  license: string
}

const stateLabel: Record<DownloadTask['state'], string> = {
  queued: '排队中',
  running: '下载中',
  paused: '已暂停',
  done: '已完成',
  error: '失败',
}

function tagTone(tag: string): 'accent' | 'blue' | 'amber' | 'neutral' {
  if (tag === 'official' || tag === 'recommended') return 'accent'
  if (tag === 'quantized' || tag === 'low-memory' || tag === 'community') return 'blue'
  if (tag === 'few-step') return 'amber'
  return 'neutral'
}

export function ModelsPage(): React.JSX.Element {
  const toast = useToast()
  const {
    catalog,
    downloads,
    env,
    refreshCatalog,
    downloadModel,
    downloadAdapter,
    pauseDownload,
    deleteModel,
  } = useApp()
  const [tab, setTab] = useState<Tab>('all')
  const [pending, setPending] = useState<Pending | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Pending | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const active = downloads.filter((task) => task.state !== 'done')
  const filteredModels = useMemo(() => {
    const list = catalog?.models ?? []
    if (tab === 'installed') return list.filter((model) => model.installed)
    return list
  }, [catalog, tab])
  const filteredAdapters = useMemo(() => {
    const list = catalog?.adapters ?? []
    if (tab === 'installed') return list.filter((adapter) => adapter.installed)
    return list
  }, [catalog, tab])

  const free = env?.device.diskFree ?? 0

  function askModel(model: ModelEntry): void {
    setPending({
      kind: 'model',
      id: model.id,
      name: model.name,
      sizeBytes: model.sizeBytes,
      repo: model.repo,
      license: model.license,
    })
  }

  function askAdapter(adapter: AdapterEntry): void {
    setPending({
      kind: 'adapter',
      id: adapter.id,
      name: adapter.name,
      sizeBytes: adapter.sizeBytes,
      repo: adapter.repo,
      license: adapter.license,
    })
  }

  async function start(): Promise<void> {
    if (!pending) return
    setBusy(pending.id)
    try {
      if (pending.kind === 'model') await downloadModel(pending.id)
      else await downloadAdapter(pending.id)
      toast.push(`${pending.name} 已加入下载队列`, 'success')
      setPending(null)
    } catch (error) {
      toast.push(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setBusy(null)
    }
  }

  async function resume(task: DownloadTask): Promise<void> {
    setBusy(task.id)
    try {
      if (task.kind === 'model') await downloadModel(task.targetId)
      else await downloadAdapter(task.targetId)
    } catch (error) {
      toast.push(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setBusy(null)
    }
  }

  async function remove(): Promise<void> {
    if (!deleteTarget) return
    try {
      await deleteModel(deleteTarget.kind, deleteTarget.id)
      toast.push('已删除本地文件', 'success')
      setDeleteTarget(null)
    } catch (error) {
      toast.push(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">{t('models.title')}</h1>
          <p className="mt-1 text-[12.5px] text-[var(--color-text-secondary)]">{t('models.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {catalog ? <Pill tone="neutral">目录：{catalog.source}</Pill> : null}
          <IconButton label="刷新" onClick={() => void refreshCatalog()}>
            <RefreshCw className="size-3.5" />
          </IconButton>
        </div>
      </header>

      <div className="flex items-center justify-between">
        <div className="inline-flex rounded-lg bg-[var(--color-surface-tertiary)] p-0.5">
          {(
            [
              ['all', t('models.all')],
              ['installed', t('models.installed')],
              ['downloading', `${t('models.downloading')}${active.length ? ` (${active.length})` : ''}`],
            ] as Array<[Tab, string]>
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={cn(
                'rounded-[7px] px-3 py-1 text-[12px] font-medium transition',
                tab === value
                  ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-tertiary)]">
          <HardDrive className="size-3.5" /> 剩余 {bytes(free)}
        </div>
      </div>

      <MotionPanel transitionKey={tab} className="space-y-4">
        {active.length > 0 ? (
          <Card className="overflow-hidden">
            <div className="border-b border-[var(--color-border-subtle)] px-4 py-2.5 text-[12.5px] font-medium">
              下载队列
            </div>
            <div className="divide-y divide-[var(--color-border-subtle)]">
              {active.map((task) => (
                <div key={task.id} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[12.5px] font-medium">{task.label}</span>
                        <Pill
                          tone={
                            task.state === 'error'
                              ? 'red'
                              : task.state === 'paused'
                                ? 'amber'
                                : task.state === 'done'
                                  ? 'accent'
                                  : 'blue'
                          }
                        >
                          {stateLabel[task.state]}
                        </Pill>
                        {task.filesTotal > 0 ? (
                          <span className="text-[10.5px] text-[var(--color-text-tertiary)]">
                            {task.filesDone}/{task.filesTotal} 文件
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1.5 flex items-center gap-3">
                        <ProgressBar value={percent(task.bytes, task.totalBytes)} className="flex-1" />
                        <span className="w-24 text-right text-[10.5px] text-[var(--color-text-tertiary)]">
                          {bytes(task.bytes)} / {bytes(task.totalBytes)}
                        </span>
                      </div>
                      {task.currentFile ? (
                        <div className="mt-1 truncate text-[10.5px] text-[var(--color-text-tertiary)]">
                          {task.currentFile}
                        </div>
                      ) : null}
                      {task.error ? (
                        <div className="mt-1 text-[10.5px] text-red-500">{task.error}</div>
                      ) : null}
                    </div>
                    {task.state === 'running' ? (
                      <IconButton label="暂停下载" onClick={() => void pauseDownload(task.id)} disabled={busy === task.id}>
                        <Pause className="size-3.5" />
                      </IconButton>
                    ) : task.state === 'paused' || task.state === 'error' ? (
                      <IconButton label="继续下载" onClick={() => void resume(task)} disabled={busy === task.id}>
                        <Play className="size-3.5" />
                      </IconButton>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {tab === 'downloading' && active.length === 0 ? (
          <EmptyState icon={<Download className="size-7" />} title="没有进行中的下载" description="从模型或适配器卡片开始下载。" />
        ) : (
          <>
            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-[13px] font-semibold">模型</h2>
                <span className="text-[10.5px] text-[var(--color-text-tertiary)]">
                  下载会写入 HF 兼容缓存，官方代码可直接命中
                </span>
              </div>
              {filteredModels.length === 0 ? (
                <EmptyState icon={<Package className="size-7" />} title="没有匹配的模型" />
              ) : (
                <div className="grid auto-rows-fr grid-cols-1 gap-3 md:grid-cols-2">
                  {filteredModels.map((model) => (
                    <Card key={model.id} className="flex h-full flex-col px-4 py-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-medium">{model.name}</div>
                          <div className="mt-0.5 truncate font-mono text-[10.5px] text-[var(--color-text-tertiary)]">
                            {model.repo}
                          </div>
                        </div>
                        {model.installed ? <Pill tone="accent">{t('common.installed')}</Pill> : null}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Pill tone="neutral">{model.precision}</Pill>
                        {model.tags
                          .filter((tag) => tag !== model.precision)
                          .map((tag) => (
                            <Pill key={tag} tone={tagTone(tag)}>
                              {tag}
                            </Pill>
                          ))}
                      </div>
                      <p className="mt-2 line-clamp-2 text-[11px] leading-5 text-[var(--color-text-secondary)]">
                        {model.notes ?? '—'}
                      </p>
                      <div className="mt-auto flex items-center justify-between border-t border-[var(--color-border-subtle)] pt-2.5">
                        <div className="text-[10.5px] text-[var(--color-text-tertiary)]">
                          {model.installed ? `已占 ${bytes(model.installedBytes)}` : `${bytes(model.sizeBytes)} · ${model.license}`}
                        </div>
                        <div className="flex items-center gap-1">
                          {model.installed ? (
                            <IconButton
                              label="删除模型"
                              onClick={() =>
                                setDeleteTarget({
                                  kind: 'model',
                                  id: model.id,
                                  name: model.name,
                                  sizeBytes: model.sizeBytes,
                                  repo: model.repo,
                                  license: model.license,
                                })
                              }
                            >
                              <Trash2 className="size-3.5" />
                            </IconButton>
                          ) : (
                            <Button tone="primary" className="min-w-[72px]" onClick={() => askModel(model)}>
                              下载
                            </Button>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-[13px] font-semibold">适配器</h2>
                <span className="text-[10.5px] text-[var(--color-text-tertiary)]">
                  LoRA / LyCORIS / DMD；DMD 需要专用采样器
                </span>
              </div>
              {filteredAdapters.length === 0 ? (
                <EmptyState icon={<ShieldCheck className="size-7" />} title="目录里还没有适配器" />
              ) : (
                <div className="grid auto-rows-fr grid-cols-1 gap-3 md:grid-cols-2">
                  {filteredAdapters.map((adapter) => (
                    <Card key={adapter.id} className="flex h-full flex-col px-4 py-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-medium">{adapter.name}</div>
                          <div className="mt-0.5 truncate font-mono text-[10.5px] text-[var(--color-text-tertiary)]">
                            {adapter.repo}
                          </div>
                        </div>
                        {adapter.installed ? <Pill tone="accent">{t('common.installed')}</Pill> : null}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Pill tone="blue">{adapter.kind}</Pill>
                        {adapter.base ? <Pill tone="neutral">base: {adapter.base}</Pill> : null}
                        {adapter.requiresProfile === 'dmd8' ? <Pill tone="amber">需要 8 步 DMD</Pill> : null}
                      </div>
                      <p className="mt-2 line-clamp-2 text-[11px] leading-5 text-[var(--color-text-secondary)]">
                        {adapter.notes ?? '—'}
                      </p>
                      <div className="mt-auto flex items-center justify-between border-t border-[var(--color-border-subtle)] pt-2.5">
                        <div className="text-[10.5px] text-[var(--color-text-tertiary)]">
                          {adapter.installed ? `已占 ${bytes(adapter.installedBytes)}` : `${bytes(adapter.sizeBytes)} · ${adapter.license}`}
                        </div>
                        {adapter.installed ? (
                          <IconButton
                            label="删除适配器"
                            onClick={() =>
                              setDeleteTarget({
                                kind: 'adapter',
                                id: adapter.id,
                                name: adapter.name,
                                sizeBytes: adapter.sizeBytes,
                                repo: adapter.repo,
                                license: adapter.license,
                              })
                            }
                          >
                            <Trash2 className="size-3.5" />
                          </IconButton>
                        ) : (
                          <Button tone="primary" className="min-w-[72px]" onClick={() => askAdapter(adapter)}>
                            下载
                          </Button>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </MotionPanel>

      <Modal
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        title="确认下载"
        description={pending ? `${pending.name} · ${pending.repo}` : undefined}
        width="max-w-lg"
        footer={
          <>
            <Button tone="ghost" onClick={() => setPending(null)}>
              {t('common.cancel')}
            </Button>
            <Button tone="primary" onClick={() => void start()} disabled={busy !== null}>
              {busy ? <Spinner className="size-3.5" /> : '开始下载'}
            </Button>
          </>
        }
      >
        {pending ? (
          <div className="space-y-3 text-[12px]">
            <div className="flex items-center justify-between">
              <span className="text-[var(--color-text-tertiary)]">预计大小</span>
              <span className="font-medium">{bytes(pending.sizeBytes)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--color-text-tertiary)]">磁盘剩余</span>
              <span className={free > 0 && free < pending.sizeBytes * 1.05 ? 'text-amber-600' : ''}>
                {bytes(free)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--color-text-tertiary)]">许可</span>
              <span>{pending.license}</span>
            </div>
            {free > 0 && free < pending.sizeBytes * 1.05 ? (
              <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[11.5px] leading-5 text-amber-700 dark:text-amber-300">
                空间可能不足。可以先下载量化版，或在设置中把模型目录换到更大的磁盘。
              </p>
            ) : (
              <p className="rounded-lg bg-[var(--color-surface-secondary)] px-3 py-2 text-[11.5px] leading-5 text-[var(--color-text-secondary)]">
                下载支持断点续传与镜像切换；完成后会按 HF 缓存布局写入，官方代码可直接读取。
              </p>
            )}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="删除本地文件"
        description={deleteTarget ? `${deleteTarget.name} · ${bytes(deleteTarget.sizeBytes)}` : undefined}
        width="max-w-md"
        footer={
          <>
            <Button tone="ghost" onClick={() => setDeleteTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button tone="danger" onClick={() => void remove()}>
              删除
            </Button>
          </>
        }
      >
        <p className="text-[12px] leading-6 text-[var(--color-text-secondary)]">
          只删除本机缓存，不影响实例的 commit。若有实例正在使用，请先解除绑定。
        </p>
      </Modal>
    </div>
  )
}
