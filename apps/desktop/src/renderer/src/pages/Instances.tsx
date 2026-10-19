import { AlertTriangle, Boxes, ChevronRight, FolderOpen, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Ipc } from '@shared/channels'
import type { BranchInfo, CommitInfo, InstanceInfo, ManagedHost } from '@shared/types'
import { call } from '../lib/api'
import { dateTime, relative } from '../lib/format'
import { t } from '../lib/i18n'
import { useApp } from '../store'
import {
  Button,
  Card,
  EmptyState,
  Modal,
  Pill,
  Segmented,
  Spinner,
  StatusDot,
  cn,
  useToast,
} from '../components/ui'

const runtimeLabel: Record<InstanceInfo['runtimeState'], string> = {
  missing: '无运行时',
  created: '运行时待安装',
  installing: '依赖安装中',
  ready: '运行时就绪',
  error: '运行时异常',
}

function runtimeTone(state: InstanceInfo['runtimeState']): 'neutral' | 'amber' | 'accent' | 'red' {
  if (state === 'ready') return 'accent'
  if (state === 'error') return 'red'
  if (state === 'installing') return 'amber'
  return 'neutral'
}

export function InstancesPage(): React.JSX.Element {
  const navigate = useNavigate()
  const toast = useToast()
  const { instances, refreshInstances, gitMessage, pushNotification } = useApp()
  const [createOpen, setCreateOpen] = useState(false)
  const [hosts, setHosts] = useState<ManagedHost[]>([])
  const [hostId, setHostId] = useState('')
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [commits, setCommits] = useState<CommitInfo[]>([])
  const [branch, setBranch] = useState('main')
  const [commit, setCommit] = useState('')
  const [name, setName] = useState('')
  const [runtimeMode, setRuntimeMode] = useState<'shared' | 'isolated'>('shared')
  const [loadingBranches, setLoadingBranches] = useState(false)
  const [loadingCommits, setLoadingCommits] = useState(false)
  const [creating, setCreating] = useState(false)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<InstanceInfo | null>(null)

  useEffect(() => {
    void refreshInstances()
  }, [refreshInstances])

  async function openCreate(): Promise<void> {
    setCreateOpen(true)
    setLoadingBranches(true)
    setHostId('')
    try {
      const [list, hostList] = await Promise.all([
        call<BranchInfo[]>(Ipc.gitBranches),
        call<ManagedHost[]>(Ipc.hostsList),
      ])
      setHosts(hostList.filter((item) => item.kind === 'ssh'))
      setBranches(list)
      const preferred = list.find((item) => item.isStable) ?? list.find((item) => item.isDefault) ?? list[0]
      if (preferred) {
        setBranch(preferred.name)
        await loadCommits(preferred.name, '')
      }
    } catch (error) {
      toast.push(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setLoadingBranches(false)
    }
  }

  async function selectHost(nextHostId: string): Promise<void> {
    setHostId(nextHostId)
    setBranches([])
    setCommits([])
    setCommit('')
    setLoadingBranches(true)
    try {
      const list =
        nextHostId
          ? await call<BranchInfo[]>(Ipc.instanceRemoteBranches, { hostId: nextHostId })
          : await call<BranchInfo[]>(Ipc.gitBranches)
      setBranches(list)
      const preferred = list.find((item) => item.isStable) ?? list.find((item) => item.isDefault) ?? list[0]
      if (preferred) {
        setBranch(preferred.name)
        await loadCommits(preferred.name, nextHostId)
      }
    } catch (error) {
      toast.push(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setLoadingBranches(false)
    }
  }

  async function loadCommits(branchName: string, targetHostId = hostId): Promise<void> {
    setLoadingCommits(true)
    try {
      const list = targetHostId
        ? await call<CommitInfo[]>(Ipc.instanceRemoteCommits, {
            hostId: targetHostId,
            branch: branchName,
            limit: 60,
          })
        : await call<CommitInfo[]>(Ipc.gitCommits, { branch: branchName, limit: 60 })
      setCommits(list)
      setCommit(list[0]?.sha ?? '')
    } catch (error) {
      toast.push(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setLoadingCommits(false)
    }
  }

  async function create(): Promise<void> {
    if (!commit) {
      toast.push('请选择一个提交', 'error')
      return
    }
    setCreating(true)
    try {
      const instance = await call<InstanceInfo>(Ipc.instanceCreate, {
        branch,
        commit,
        name: name.trim() || undefined,
        runtimeMode,
        hostId: hostId || undefined,
      })
      toast.push(`实例 ${instance.name} 已创建${hostId ? '（远端）' : ''}`, 'success')
      pushNotification({
        tone: 'success',
        title: '实例已创建',
        message: `${instance.name} 已固定到 ${instance.shortCommit}${hostId ? ' · 远端' : ''}`,
      })
      setCreateOpen(false)
      setName('')
      if (hostId) await call(Ipc.hostsTest, { id: hostId }).catch(() => undefined)
      await refreshInstances()
      navigate(`/instances/${instance.id}`)
    } catch (error) {
      toast.push(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setCreating(false)
    }
  }

  async function install(instance: InstanceInfo): Promise<void> {
    setInstallingId(instance.id)
    try {
      await call(Ipc.runtimeInstall, { instanceId: instance.id })
      toast.push('依赖安装完成', 'success')
      pushNotification({
        tone: 'success',
        title: '依赖安装完成',
        message: `${instance.name} 的运行时已就绪`,
      })
      await refreshInstances()
    } catch (error) {
      toast.push(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setInstallingId(null)
    }
  }

  async function remove(): Promise<void> {
    if (!deleteTarget) return
    try {
      await call(Ipc.instanceDelete, { id: deleteTarget.id, keepOutputs: true })
      setDeleteTarget(null)
      await refreshInstances()
      toast.push('实例已删除（输出已保留）', 'success')
    } catch (error) {
      toast.push(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  const stable = branches.find((item) => item.isStable)

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">{t('instances.title')}</h1>
          <p className="mt-1 text-[12.5px] text-[var(--color-text-secondary)]">{t('instances.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button tone="ghost" onClick={() => void refreshInstances()}>
            <RefreshCw className="size-3.5" />
          </Button>
          <Button tone="primary" onClick={() => void openCreate()}>
            <span className="inline-flex items-center gap-1.5">
              <Plus className="size-3.5" /> {t('instances.create')}
            </span>
          </Button>
        </div>
      </header>

      {gitMessage ? (
        <Card className="flex items-center gap-3 border-sky-500/20 bg-sky-500/[0.05] px-4 py-2.5 text-[12px]">
          <Spinner className="size-3.5 text-sky-500" />
          <span>{gitMessage}</span>
        </Card>
      ) : null}

      {instances.length === 0 ? (
        <EmptyState
          icon={<Boxes className="size-7" />}
          title={t('instances.empty')}
          description={t('instances.emptyHint')}
          action={
            <Button tone="primary" onClick={() => void openCreate()}>
              创建第一个实例
            </Button>
          }
        />
      ) : (
        <div className="space-y-2.5">
          {instances.map((instance) => (
            <Card
              key={instance.id}
              className="group flex items-center gap-4 px-4 py-3 transition hover:border-accent-500/25"
            >
              <StatusDot
                status={instance.status === 'ok' ? 'ok' : instance.status === 'missing' ? 'error' : 'warn'}
                className="mt-0.5"
              />
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => navigate(`/instances/${instance.id}`)}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-[13px] font-medium">{instance.name}</span>
                  {instance.channel === 'stable' ? <Pill tone="accent">稳定版</Pill> : null}
                  {instance.channel === 'experimental' ? <Pill tone="amber">实验</Pill> : null}
                  {instance.channel === 'custom' ? <Pill tone="blue">自定义</Pill> : null}
                  {instance.placement.kind === 'ssh' ? (
                    <Pill tone="blue">远端 · {instance.placement.hostName ?? instance.placement.hostId}</Pill>
                  ) : null}
                  {instance.dirty ? <Pill tone="amber">有本地改动</Pill> : null}
                  <Pill tone={runtimeTone(instance.runtimeState)}>{runtimeLabel[instance.runtimeState]}</Pill>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-[var(--color-text-tertiary)]">
                  <span>{instance.branch}</span>
                  <span>·</span>
                  <span className="font-mono">{instance.shortCommit}</span>
                  <span>·</span>
                  <span>{dateTime(instance.commitDate)}</span>
                  {instance.subject ? (
                    <>
                      <span>·</span>
                      <span className="max-w-[420px] truncate">{instance.subject}</span>
                    </>
                  ) : null}
                </div>
              </button>
              <div className="flex shrink-0 items-center gap-1.5">
                {instance.runtimeState !== 'ready' ? (
                  <Button
                    tone="secondary"
                    disabled={installingId === instance.id}
                    onClick={() => void install(instance)}
                  >
                    {installingId === instance.id ? <Spinner className="size-3.5" /> : t('instances.installDeps')}
                  </Button>
                ) : null}
                <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                  {instance.placement.kind === 'local' ? (
                    <Button tone="ghost" onClick={() => void call(Ipc.instanceOpen, { id: instance.id })}>
                      <FolderOpen className="size-3.5" />
                    </Button>
                  ) : null}
                  <Button tone="ghost" onClick={() => setDeleteTarget(instance)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
                <ChevronRight
                  className="size-4 cursor-pointer text-[var(--color-text-tertiary)]"
                  onClick={() => navigate(`/instances/${instance.id}`)}
                />
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => !creating && setCreateOpen(false)}
        title="新建实例"
        description="实例固定到一个 commit；本机或 SSH 设备都可以部署。远端会独立 clone/worktree/venv，不上传本机权重。"
        width="max-w-3xl"
        footer={
          <>
            <Button tone="ghost" onClick={() => setCreateOpen(false)} disabled={creating}>
              {t('common.cancel')}
            </Button>
            <Button tone="primary" onClick={() => void create()} disabled={creating || !commit}>
              {creating ? <Spinner className="size-3.5" /> : '创建实例'}
            </Button>
          </>
        }
      >
        {loadingBranches ? (
          <div className="flex items-center gap-3 py-10 text-[12.5px] text-[var(--color-text-secondary)]">
            <Spinner /> 正在读取分支。首次使用会克隆 MOSS-Image（约 85 MB）。
          </div>
        ) : (
          <div className="space-y-5">
            <label className="block space-y-1.5">
              <span className="text-[11.5px] font-medium text-[var(--color-text-secondary)]">运行位置</span>
              <select
                value={hostId}
                onChange={(event) => void selectHost(event.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2 text-[12.5px] outline-none focus:border-accent-500"
              >
                <option value="">本机</option>
                {hosts.map((host) => (
                  <option key={host.id} value={host.id}>
                    {host.name} · {host.user}@{host.host}:{host.port ?? 22}
                  </option>
                ))}
              </select>
              <span className="block text-[10px] leading-4 text-[var(--color-text-tertiary)]">
                {hosts.length === 0
                  ? '还没有 SSH 设备；先在设备管理器添加并测试连接。'
                  : hostId
                    ? '远端：按 commit 创建 mirror/worktree/venv；模型需已在远端缓存，不会自动上传本机 27 GB。'
                    : '本机：使用本地 mirror/worktree/venv。'}
              </span>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5">
                <span className="text-[11.5px] font-medium text-[var(--color-text-secondary)]">分支</span>
                <select
                  value={branch}
                  onChange={(event) => {
                    setBranch(event.target.value)
                    void loadCommits(event.target.value)
                  }}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2 text-[12.5px] outline-none focus:border-accent-500"
                >
                  {branches.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.name}
                      {item.isStable ? '（稳定版）' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-[11.5px] font-medium text-[var(--color-text-secondary)]">实例名称（可选）</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={commit ? `moss-${branch}-${commit.slice(0, 7)}` : '自动生成'}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2 text-[12.5px] outline-none focus:border-accent-500"
                />
              </label>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11.5px] font-medium text-[var(--color-text-secondary)]">提交</span>
                <span className="text-[10.5px] text-[var(--color-text-tertiary)]">
                  稳定版：main HEAD{stable ? ` · ${stable.sha.slice(0, 7)}` : ''}
                </span>
              </div>
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-[var(--color-border-subtle)] p-1">
                {loadingCommits ? (
                  <div className="flex items-center gap-2 px-3 py-6 text-[12px] text-[var(--color-text-secondary)]">
                    <Spinner /> 读取提交…
                  </div>
                ) : (
                  commits.map((item) => (
                    <button
                      key={item.sha}
                      type="button"
                      onClick={() => setCommit(item.sha)}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-md px-3 py-2 text-left transition',
                        commit === item.sha
                          ? 'bg-accent-500/10 ring-1 ring-inset ring-accent-500/30'
                          : 'hover:bg-[var(--color-surface-secondary)]',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-1 size-2.5 shrink-0 rounded-full border',
                          commit === item.sha ? 'border-accent-500 bg-accent-500' : 'border-[var(--color-border-strong)]',
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11.5px] text-[var(--color-text-secondary)]">
                            {item.short}
                          </span>
                          <span className="text-[11px] text-[var(--color-text-tertiary)]">{dateTime(item.date)}</span>
                          {item.sha === stable?.sha ? <Pill tone="accent">稳定版</Pill> : null}
                        </div>
                        <div className="truncate text-[12px]">{item.subject || '(无提交信息)'}</div>
                        <div className="text-[10.5px] text-[var(--color-text-tertiary)]">{item.author}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-[11.5px] font-medium text-[var(--color-text-secondary)]">Python 运行时</span>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border-subtle)] px-3 py-2.5">
                <div className="text-[11.5px] text-[var(--color-text-secondary)]">
                  共享运行时按依赖锁复用，省 1–5 GB；独立运行时完全隔离。
                </div>
                <Segmented
                  value={runtimeMode}
                  onChange={setRuntimeMode}
                  options={[
                    { value: 'shared', label: '共享（推荐）' },
                    { value: 'isolated', label: '独立' },
                  ]}
                />
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-lg bg-[var(--color-surface-secondary)] px-3 py-2 text-[11.5px] text-[var(--color-text-secondary)]">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
              创建只准备代码与虚拟环境，不会自动下载 27 GB 权重；依赖与模型可在实例详情或模型页安装。
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="删除实例"
        description={deleteTarget ? `将删除 ${deleteTarget.name} 的代码目录与运行时引用，输出会保留。` : undefined}
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
        <p className="text-[12.5px] leading-6 text-[var(--color-text-secondary)]">
          实例 pin 的 commit 仍保留在本地 git 镜像中，随时可以重新创建；输出目录会复制到
          <code className="mx-1 rounded bg-[var(--color-surface-tertiary)] px-1 text-[11px]">outputs-kept/</code>
          下。
        </p>
      </Modal>
    </div>
  )
}
