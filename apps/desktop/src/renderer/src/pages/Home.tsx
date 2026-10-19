import { ArrowRight, Boxes, Package, RefreshCw, Sparkles, Wrench } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Ipc } from '@shared/channels'
import type { CheckAction, CheckItem } from '@shared/types'
import { call } from '../lib/api'
import { bytes, relative } from '../lib/format'
import { t } from '../lib/i18n'
import { useApp } from '../store'
import {
  Button,
  Card,
  MarkdownBody,
  Pill,
  Spinner,
  StatusDot,
  cn,
  useToast,
} from '../components/ui'

const groupTitles: Record<CheckItem['group'], string> = {
  system: '系统',
  accelerator: '加速器',
  memory: '内存与磁盘',
  tools: '工具链',
  network: '网络',
  ports: '端口',
}

const announcementTone: Record<string, string> = {
  info: 'border-sky-500/20 bg-sky-500/[0.04]',
  success: 'border-emerald-500/20 bg-emerald-500/[0.04]',
  warning: 'border-amber-500/25 bg-amber-500/[0.05]',
  critical: 'border-red-500/25 bg-red-500/[0.05]',
}

export function HomePage(): React.JSX.Element {
  const navigate = useNavigate()
  const toast = useToast()
  const [expanded, setExpanded] = useState(false)
  const { env, updates, instances, scanning, refreshEnv, dismissAnnouncement, refreshUpdates } = useApp()

  const announcement = updates?.announcements[0]
  useEffect(() => {
    setExpanded(false)
  }, [announcement?.id])

  const body = announcement ? announcement.body.replace(/^\s*#\s+.*\n+/, '') : ''
  const recent = [...instances]
    .sort((a, b) => (b.lastUsedAt ?? b.createdAt).localeCompare(a.lastUsedAt ?? a.createdAt))
    .slice(0, 3)

  async function handleAction(action: CheckAction): Promise<void> {
    if (action.kind === 'rescan') {
      await refreshEnv()
    } else if (action.kind === 'open-settings') {
      navigate('/settings')
    } else if (action.kind === 'open-url' && action.url) {
      await call(Ipc.openExternal, { url: action.url })
    } else if (action.kind === 'install-python') {
      navigate('/settings')
    }
  }

  const groups = (() => {
    const map = new Map<CheckItem['group'], CheckItem[]>()
    for (const check of env?.checks ?? []) {
      const list = map.get(check.group) ?? []
      list.push(check)
      map.set(check.group, list)
    }
    return [...map.entries()]
  })()

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">{t('home.title')}</h1>
          <p className="mt-1 text-[12.5px] text-[var(--color-text-secondary)]">{t('home.subtitle')}</p>
        </div>
        <Button tone="ghost" onClick={() => void refreshEnv()} disabled={scanning}>
          <span className="inline-flex items-center gap-1.5">
            {scanning ? <Spinner className="size-3.5" /> : <RefreshCw className="size-3.5" />}
            {t('home.rescan')}
          </span>
        </Button>
      </header>

      {announcement ? (
        <Card className={cn('relative overflow-hidden px-5 py-4', announcementTone[announcement.level])}>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-moss-500 dark:text-moss-300" />
              <span className="text-[12.5px] font-semibold">{announcement.title}</span>
              {announcement.pinned ? <Pill tone="moss">置顶</Pill> : null}
            </div>
            <div className="flex items-center gap-2">
              {announcement.action ? (
                <Button
                  tone="ghost"
                  onClick={() => {
                    if (announcement.action?.kind === 'open_url' && announcement.action.url) {
                      void call(Ipc.openExternal, { url: announcement.action.url })
                    } else if (announcement.action?.kind === 'check_update') {
                      void refreshUpdates()
                    } else {
                      navigate('/settings')
                    }
                  }}
                >
                  {announcement.action.label}
                </Button>
              ) : null}
              <Button tone="ghost" onClick={() => setExpanded((value) => !value)}>
                {expanded ? '收起' : '展开'}
              </Button>
              {announcement.dismissible ? (
                <Button
                  tone="ghost"
                  onClick={() =>
                    void dismissAnnouncement(announcement.id).then(() => toast.push('已收起这条公告', 'success'))
                  }
                >
                  不再显示
                </Button>
              ) : null}
            </div>
          </div>
          <div className={cn('relative', !expanded && 'max-h-[84px] overflow-hidden')}>
            <MarkdownBody>{body}</MarkdownBody>
            {!expanded ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[var(--color-surface)] to-transparent" />
            ) : null}
          </div>
        </Card>
      ) : null}

      {updates?.updateAvailable ? (
        <Card className="flex items-center justify-between gap-3 border-moss-500/25 bg-moss-500/[0.06] px-5 py-3">
          <div className="text-[12.5px]">
            新版本 <span className="font-semibold">{updates.latestVersion}</span> 可用，当前 {updates.currentVersion}。
          </div>
          <Button tone="primary" onClick={() => navigate('/settings')}>
            查看更新
          </Button>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-[1.6fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-5 py-3">
            <div>
              <h2 className="text-[13.5px] font-semibold">设备环境</h2>
              <p className="mt-0.5 text-[11.5px] text-[var(--color-text-tertiary)]">
                {env ? `检测于 ${relative(env.scannedAt)} · 共 ${env.checks.length} 项` : '正在读取设备信息'}
              </p>
            </div>
            {scanning ? <Spinner /> : null}
          </div>

          {!env ? (
            <div className="space-y-3 px-5 py-4">
              {[0, 1, 2, 3, 4].map((index) => (
                <div key={index} className="h-8 animate-pulse rounded-md bg-[var(--color-surface-tertiary)]" />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-[var(--color-border-subtle)]">
              {groups.map(([group, checks]) => (
                <div key={group} className="px-5 py-3">
                  <div className="mb-1 text-[10.5px] font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
                    {groupTitles[group]}
                  </div>
                  <div className="space-y-1">
                    {checks.map((check) => (
                      <div key={check.id} className="flex items-start gap-2.5 py-1.5">
                        <StatusDot status={check.status} className="mt-[7px]" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="text-[12.5px] font-medium">{check.label}</span>
                            <span className="truncate text-right text-[12px] text-[var(--color-text-secondary)]">
                              {check.value}
                            </span>
                          </div>
                          {check.detail ? (
                            <p className="mt-0.5 text-[11.5px] leading-5 text-[var(--color-text-tertiary)]">
                              {check.detail}
                            </p>
                          ) : null}
                          {check.actions?.length ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {check.actions.map((action) => (
                                <Button key={action.id} tone="ghost" onClick={() => void handleAction(action)}>
                                  {action.label}
                                </Button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card className="overflow-hidden border-moss-500/20 bg-moss-500/[0.05]">
            <div className="px-5 py-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wider text-moss-600 dark:text-moss-300">
                  {t('home.recommended')}
                </span>
                {env ? <Pill tone="moss">{env.recommendation.quant.toUpperCase()}</Pill> : null}
              </div>
              {env ? (
                <>
                  <div className="mt-3 text-[26px] font-semibold tracking-tight">
                    {env.recommendation.width} × {env.recommendation.height}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[12px] text-[var(--color-text-secondary)]">
                    <span>{env.recommendation.steps} 步</span>
                    <span className="text-[var(--color-text-tertiary)]">·</span>
                    <span>{env.recommendation.profile === 'dmd8' ? 'DMD' : 'CFG 3'}</span>
                    <span className="text-[var(--color-text-tertiary)]">·</span>
                    <span>{env.recommendation.estimatedLabel}</span>
                  </div>
                  <p className="mt-3 text-[11.5px] leading-5 text-[var(--color-text-secondary)]">
                    {env.recommendation.note}
                  </p>
                </>
              ) : (
                <div className="mt-3 h-16 animate-pulse rounded-md bg-moss-500/10" />
              )}
              <Button tone="primary" className="mt-4 w-full" onClick={() => navigate('/instances')}>
                <span className="inline-flex items-center gap-1.5">
                  {t('home.newInstance')} <ArrowRight className="size-3.5" />
                </span>
              </Button>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => navigate('/instances')}
              className="flex flex-col items-start gap-2 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface)] px-3.5 py-3 text-left transition hover:border-moss-500/30 hover:bg-moss-500/[0.03]"
            >
              <Boxes className="size-4 text-moss-500" />
              <div>
                <div className="text-[12.5px] font-medium">实例</div>
                <div className="text-[11px] text-[var(--color-text-tertiary)]">{instances.length} 个已安装</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => navigate('/models')}
              className="flex flex-col items-start gap-2 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface)] px-3.5 py-3 text-left transition hover:border-moss-500/30 hover:bg-moss-500/[0.03]"
            >
              <Package className="size-4 text-moss-500" />
              <div>
                <div className="text-[12.5px] font-medium">模型</div>
                <div className="text-[11px] text-[var(--color-text-tertiary)]">
                  {(env?.device.diskFree ?? 0) > 0 ? `${bytes(env?.device.diskFree)} 可用` : '管理权重'}
                </div>
              </div>
            </button>
          </div>

          <Card className="px-4 py-3">
            <div className="flex items-center gap-2 text-[12px] font-medium">
              <Wrench className="size-3.5 text-[var(--color-text-tertiary)]" />
              小提示
            </div>
            <p className="mt-1.5 text-[11.5px] leading-5 text-[var(--color-text-secondary)]">
              16 GB 机器建议先用 768² + 8 步 DMD；首次下载 bf16 权重约 27 GB，也可以先用社区 int8 包。
            </p>
          </Card>
        </div>
      </div>

      <Card>
        <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-5 py-3">
          <h2 className="text-[13.5px] font-semibold">{t('home.recent')}</h2>
          <Button tone="ghost" onClick={() => navigate('/instances')}>
            全部实例
          </Button>
        </div>
        {recent.length === 0 ? (
          <div className="px-5 py-6 text-center text-[12px] text-[var(--color-text-tertiary)]">
            {t('instances.empty')}，创建一个来开始。
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border-subtle)]">
            {recent.map((instance) => (
              <button
                key={instance.id}
                type="button"
                onClick={() => navigate(`/instances/${instance.id}`)}
                className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition hover:bg-[var(--color-surface-secondary)]"
              >
                <StatusDot status={instance.status === 'ok' ? 'ok' : instance.status === 'missing' ? 'error' : 'warn'} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[12.5px] font-medium">{instance.name}</span>
                    {instance.channel === 'stable' ? <Pill tone="moss">稳定版</Pill> : null}
                    {instance.channel === 'experimental' ? <Pill tone="amber">实验</Pill> : null}
                    {instance.dirty ? <Pill tone="amber">有本地改动</Pill> : null}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[var(--color-text-tertiary)]">
                    {instance.branch} · {instance.shortCommit} · {relative(instance.lastUsedAt ?? instance.createdAt)}
                  </div>
                </div>
                <ArrowRight className="size-3.5 text-[var(--color-text-tertiary)]" />
              </button>
            ))}
          </div>
        )}
      </Card>

      {updates?.error ? (
        <Card className="border-amber-500/25 bg-amber-500/[0.05] px-4 py-3 text-[11.5px] text-amber-700 dark:text-amber-300">
          更新检查失败：{updates.error}
        </Card>
      ) : null}
    </div>
  )
}
