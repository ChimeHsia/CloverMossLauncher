import { AlertTriangle, CheckCircle2, Info, Megaphone, X } from 'lucide-react'
import { Ipc } from '@shared/channels'
import { call } from '../lib/api'
import { relative } from '../lib/format'
import { useApp } from '../store'
import { cn, IconButton } from './ui'

const toneIcon = {
  info: <Info className="size-3.5 text-accent-300" />,
  success: <CheckCircle2 className="size-3.5 text-accent-300" />,
  warning: <AlertTriangle className="size-3.5 text-amber-300" />,
  error: <AlertTriangle className="size-3.5 text-red-300" />,
}

function preview(text: string): string {
  return text
    .replace(/[#>*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function NotificationPanel(): React.JSX.Element | null {
  const open = useApp((state) => state.notificationsOpen)
  const notifications = useApp((state) => state.notifications)
  const updates = useApp((state) => state.updates)
  const toggle = useApp((state) => state.setNotificationsOpen)
  const markAllRead = useApp((state) => state.markAllNotificationsRead)
  const dismissAnnouncement = useApp((state) => state.dismissAnnouncement)
  const refreshUpdates = useApp((state) => state.refreshUpdates)
  const unread = notifications.filter((item) => !item.read).length

  if (!open) return null

  const announcements = (updates?.announcements ?? []).slice(0, 4)

  return (
    <div className="glass-strong fixed right-3 top-[52px] z-40 flex max-h-[calc(100vh-64px)] w-[340px] flex-col overflow-hidden rounded-[6px] border border-[var(--color-border-subtle)] shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--color-border-subtle)] px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <span className="text-[12.5px] font-semibold">通知</span>
          {unread > 0 ? <span className="text-[10px] text-accent-300">{unread} 未读</span> : null}
        </div>
        <div className="flex items-center gap-0.5">
          {unread > 0 ? (
            <button
              type="button"
              onClick={markAllRead}
              className="rounded-[4px] px-1.5 py-1 text-[10px] text-[var(--color-text-tertiary)] hover:bg-white/[0.06] hover:text-[var(--color-text-secondary)]"
            >
              全部已读
            </button>
          ) : null}
          <IconButton label="关闭通知" className="size-6" onClick={() => toggle(false)}>
            <X className="size-3.5" />
          </IconButton>
        </div>
      </header>

      <div className="min-h-0 overflow-y-auto">
        <section className="px-4 pb-3 pt-3">
          <div className="mb-2 flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-tertiary)]">
            <Megaphone className="size-3" />
            公告
          </div>
          {announcements.length === 0 ? (
            <p className="py-2 text-[11px] leading-5 text-[var(--color-text-tertiary)]">
              暂无公告。启动时会从仓库的 release 清单拉取。
            </p>
          ) : (
            <div>
              {announcements.map((announcement) => (
                <article
                  key={announcement.id}
                  className="border-b border-[var(--color-border-subtle)] py-2.5 last:border-0 last:pb-0 first:pt-0"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-[12px] font-medium leading-5 text-[var(--color-text)]">
                      {announcement.title}
                    </h3>
                    <span className="shrink-0 text-[9px] text-[var(--color-text-tertiary)]">
                      {announcement.startsAt ? relative(announcement.startsAt) : ''}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-3 text-[10.5px] leading-[17px] text-[var(--color-text-secondary)]">
                    {preview(announcement.body)}
                  </p>
                  <div className="mt-1.5 flex items-center gap-3">
                    {announcement.action ? (
                      <button
                        type="button"
                        className="text-[10px] text-accent-300 hover:underline"
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
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="border-t border-[var(--color-border-subtle)] px-4 pb-4 pt-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-tertiary)]">
              应用内通知
            </span>
            <span className="text-[9px] tabular-nums text-[var(--color-text-tertiary)]">
              {notifications.length}
            </span>
          </div>
          {notifications.length === 0 ? (
            <p className="py-2 text-[11px] leading-5 text-[var(--color-text-tertiary)]">
              实例、依赖安装、下载与任务的结果会出现在这里。
            </p>
          ) : (
            <div>
              {notifications.slice(0, 8).map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-2.5 border-b border-[var(--color-border-subtle)] py-2 last:border-0 last:pb-0 first:pt-0"
                >
                  <div className="mt-0.5 shrink-0">{toneIcon[item.tone]}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className={cn(
                          'truncate text-[11.5px] leading-5',
                          item.read ? 'text-[var(--color-text-secondary)]' : 'font-medium text-[var(--color-text)]',
                        )}
                      >
                        {item.title}
                      </span>
                      <span className="shrink-0 text-[9px] text-[var(--color-text-tertiary)]">
                        {relative(item.createdAt)}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-[10px] leading-[16px] text-[var(--color-text-tertiary)]">
                      {item.message}
                    </p>
                  </div>
                  {!item.read ? <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent-400" /> : null}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
