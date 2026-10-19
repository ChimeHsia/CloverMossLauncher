import { Check, Info, Megaphone, TriangleAlert, X, XCircle } from 'lucide-react'
import { Ipc } from '@shared/channels'
import type { AppNotification } from '@shared/types'
import { call } from '../lib/api'
import { relative } from '../lib/format'
import { useApp } from '../store'
import { Button, Card, IconButton, cn } from './ui'

const toneIcon: Record<AppNotification['tone'], React.ReactNode> = {
  info: <Info className="size-3.5 text-sky-500" />,
  success: <Check className="size-3.5 text-accent-500" />,
  warning: <TriangleAlert className="size-3.5 text-amber-500" />,
  error: <XCircle className="size-3.5 text-red-500" />,
}

function preview(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`[\]()!-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 96)
}

export function NotificationPanel(): React.JSX.Element | null {
  const open = useApp((state) => state.notificationsOpen)
  const toggle = useApp((state) => state.toggleNotifications)
  const updates = useApp((state) => state.updates)
  const notifications = useApp((state) => state.notifications)
  const markAllRead = useApp((state) => state.markAllNotificationsRead)
  const refreshUpdates = useApp((state) => state.refreshUpdates)
  const dismissAnnouncement = useApp((state) => state.dismissAnnouncement)

  if (!open) return null

  const unread = notifications.filter((item) => !item.read).length

  return (
    <div className="glass-strong fixed right-2.5 top-[52px] z-40 flex max-h-[calc(100vh-64px)] w-[320px] flex-col gap-2 rounded-2xl border border-[var(--color-border-subtle)] p-2.5 shadow-[0_18px_45px_rgba(2,6,23,0.35)]">
      <div className="flex items-center justify-between px-1.5 pt-0.5">
        <div className="flex items-center gap-2 text-[12px] font-semibold">
          通知
          {unread > 0 ? (
            <span className="rounded-full bg-accent-500/15 px-1.5 text-[10px] leading-4 text-accent-700 dark:text-accent-200">
              {unread} 未读
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-0.5">
          {unread > 0 ? (
            <Button tone="ghost" onClick={markAllRead}>
              全部已读
            </Button>
          ) : null}
          <IconButton label="关闭通知" onClick={toggle}>
            <X className="size-4" />
          </IconButton>
        </div>
      </div>

      <div className="shrink-0 overflow-hidden rounded-xl border border-[var(--color-border-subtle)] bg-white/45 p-2.5 dark:bg-white/[0.03]">
        <div className="flex items-center justify-between px-0.5 pb-2">
          <div className="flex items-center gap-1.5 text-[11.5px] font-medium">
            <Megaphone className="size-3.5 text-accent-500" />
            公告
          </div>
          <span className="text-[10px] text-[var(--color-text-tertiary)]">
            {updates?.manifestSource === 'local' ? '本地 release' : 'GitHub release'}
          </span>
        </div>
        {updates?.announcements?.length ? (
          <div className="space-y-2">
            {updates.announcements.slice(0, 3).map((announcement) => (
              <div
                key={announcement.id}
                className="rounded-xl border border-accent-500/15 bg-accent-500/[0.045] p-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[12px] font-medium leading-5">{announcement.title}</div>
                  {announcement.action ? (
                    <button
                      type="button"
                      className="shrink-0 text-[10.5px] text-accent-600 hover:underline dark:text-accent-300"
                      onClick={() => {
                        if (announcement.action?.kind === 'open_url' && announcement.action.url) {
                          void call(Ipc.openExternal, { url: announcement.action.url })
                        } else if (announcement.action?.kind === 'check_update') {
                          void refreshUpdates()
                        }
                      }}
                    >
                      {announcement.action.label}
                    </button>
                  ) : null}
                </div>
                <p className="mt-1 line-clamp-2 text-[10.5px] leading-4 text-[var(--color-text-secondary)]">
                  {preview(announcement.body)}
                </p>
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="text-[9.5px] text-[var(--color-text-tertiary)]">
                    {announcement.startsAt ? relative(announcement.startsAt) : ''}
                  </span>
                  {announcement.dismissible ? (
                    <button
                      type="button"
                      className="text-[10px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
                      onClick={() => void dismissAnnouncement(announcement.id)}
                    >
                      不再显示
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-0.5 py-2 text-[11px] text-[var(--color-text-tertiary)]">
            暂无公告。启动时会从仓库的 release 清单拉取。
          </p>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--color-border-subtle)] bg-white/45 p-2.5 dark:bg-white/[0.03]">
        <div className="flex items-center justify-between px-0.5 pb-2">
          <div className="text-[11.5px] font-medium">应用内通知</div>
          <span className="text-[10px] text-[var(--color-text-tertiary)]">{notifications.length}</span>
        </div>
        <div className="-mr-1 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {notifications.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--color-border)] px-3 py-5 text-center">
              <p className="text-[11px] text-[var(--color-text-secondary)]">暂无通知</p>
              <p className="mt-1 text-[10px] leading-4 text-[var(--color-text-tertiary)]">
                实例、依赖安装与下载的结果会出现在这里。
              </p>
            </div>
          ) : (
            notifications.map((item) => (
              <div
                key={item.id}
                className={cn(
                  'flex items-start gap-2 rounded-lg px-1.5 py-1.5',
                  !item.read && 'bg-accent-500/[0.05]',
                )}
              >
                <div className="mt-1 shrink-0">{toneIcon[item.tone]}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[11.5px] font-medium">{item.title}</span>
                    <span className="ml-auto shrink-0 text-[9.5px] text-[var(--color-text-tertiary)]">
                      {relative(item.createdAt)}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-4 text-[var(--color-text-secondary)]">
                    {item.message}
                  </p>
                </div>
                {!item.read ? <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent-500" /> : null}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
