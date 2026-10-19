import {
  Bell,
  BellOff,
  Boxes,
  Home,
  Images,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Settings as SettingsIcon,
  Sparkles,
  Wand2,
  type LucideIcon,
} from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import { t, type MessageKey } from '../lib/i18n'
import { useApp } from '../store'
import { cn, IconButton, Pill, StatusDot } from './ui'

interface NavItem {
  to: string
  key: MessageKey
  icon: LucideIcon
  end?: boolean
}

const navItems: NavItem[] = [
  { to: '/', key: 'nav.home', icon: Home, end: true },
  { to: '/studio', key: 'nav.studio', icon: Wand2 },
  { to: '/instances', key: 'nav.instances', icon: Boxes },
  { to: '/models', key: 'nav.models', icon: Package },
  { to: '/gallery', key: 'nav.gallery', icon: Images },
]

export function Sidebar(): React.JSX.Element {
  const settings = useApp((state) => state.settings)
  const instances = useApp((state) => state.instances)
  const downloads = useApp((state) => state.downloads)
  const env = useApp((state) => state.env)
  const collapsed = settings?.sidebarCollapsed ?? false
  const activeDownloads = downloads.filter((task) => task.state === 'running' || task.state === 'queued').length

  return (
    <aside
      className={cn(
        'glass flex shrink-0 flex-col border-r border-[var(--color-border-subtle)] py-3 transition-[width,padding] duration-200 ease-out',
        collapsed ? 'w-[64px] px-2' : 'w-[212px] px-2.5',
      )}
    >
      <div className={cn('flex items-center gap-2.5 pb-4 pt-1', collapsed ? 'justify-center' : 'px-1.5')}>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent-400 via-accent-500 to-accent-600 text-white shadow-[0_4px_14px_rgba(59,130,246,0.35)]">
          <Sparkles className="size-4" />
        </div>
        {!collapsed ? (
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold tracking-tight">CloverMoss</div>
            <div className="truncate text-[10px] text-[var(--color-text-tertiary)]">MOSS 创作台</div>
          </div>
        ) : null}
      </div>

      <nav className="flex flex-col gap-0.5">
        {navItems.map((item) => {
          const Icon = item.icon
          const count =
            item.to === '/instances' ? instances.length : item.to === '/models' ? activeDownloads : 0
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={collapsed ? t(item.key) : undefined}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center rounded-[10px] text-[12.5px] transition',
                  collapsed ? 'h-10 justify-center' : 'h-9 gap-2.5 px-2.5',
                  isActive
                    ? 'bg-accent-500/12 font-medium text-accent-700 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.18)] dark:text-accent-200'
                    : 'text-[var(--color-text-secondary)] hover:bg-white/50 hover:text-[var(--color-text)] dark:hover:bg-white/[0.06]',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={cn('size-4 shrink-0', isActive && 'text-accent-600 dark:text-accent-300')}
                    strokeWidth={1.9}
                  />
                  {!collapsed ? <span className="flex-1 truncate">{t(item.key)}</span> : null}
                  {!collapsed && count > 0 ? (
                    <span className="rounded-full bg-accent-500/12 px-1.5 text-[10px] leading-4 text-accent-700 dark:text-accent-200">
                      {count}
                    </span>
                  ) : null}
                </>
              )}
            </NavLink>
          )
        })}
      </nav>

      <div className="mt-auto space-y-2 pt-3">
        {!collapsed ? (
          <div className="rounded-xl border border-[var(--color-border-subtle)] bg-white/45 p-2.5 dark:bg-white/[0.04]">
            <div className="flex items-center gap-2">
              <StatusDot status={env ? (env.gpu.available ? 'ok' : 'warn') : 'unknown'} />
              <span className="truncate text-[11px] text-[var(--color-text-secondary)]">
                {env ? env.gpu.name : '正在检测设备'}
              </span>
            </div>
            {env ? (
              <div className="mt-1.5 flex items-center justify-between text-[10px] text-[var(--color-text-tertiary)]">
                <span>{(env.device.memoryTotal / 1024 ** 3).toFixed(0)} GB 内存</span>
                <span>{(env.device.diskFree / 1024 ** 3).toFixed(0)} GB 可用</span>
              </div>
            ) : null}
          </div>
        ) : null}
        <NavLink
          to="/settings"
          title={collapsed ? t('nav.settings') : undefined}
          className={({ isActive }) =>
            cn(
              'flex items-center rounded-[10px] text-[12.5px] transition',
              collapsed ? 'h-10 justify-center' : 'h-9 gap-2.5 px-2.5',
              isActive
                ? 'bg-accent-500/12 font-medium text-accent-700 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.18)] dark:text-accent-200'
                : 'text-[var(--color-text-secondary)] hover:bg-white/50 hover:text-[var(--color-text)] dark:hover:bg-white/[0.06]',
            )
          }
        >
          <SettingsIcon className="size-4 shrink-0" strokeWidth={1.9} />
          {!collapsed ? <span className="flex-1">{t('nav.settings')}</span> : null}
        </NavLink>
        {!collapsed ? (
          <div className="flex items-center justify-between px-1 pb-0.5 text-[10px] text-[var(--color-text-tertiary)]">
            <span>CloverMoss Launcher</span>
            <Pill tone="neutral">{env?.appVersion ?? '0.1.0'}</Pill>
          </div>
        ) : null}
      </div>
    </aside>
  )
}

const titles: Record<string, string> = {
  '/': t('home.title'),
  '/studio': t('nav.studio'),
  '/instances': t('instances.title'),
  '/models': t('models.title'),
  '/gallery': t('nav.gallery'),
  '/settings': t('settings.title'),
}

export function Topbar(): React.JSX.Element {
  const location = useLocation()
  const settings = useApp((state) => state.settings)
  const updates = useApp((state) => state.updates)
  const notifications = useApp((state) => state.notifications)
  const notificationsOpen = useApp((state) => state.notificationsOpen)
  const toggleSidebar = useApp((state) => state.toggleSidebar)
  const toggleNotifications = useApp((state) => state.toggleNotifications)
  const collapsed = settings?.sidebarCollapsed ?? false
  const unread = notifications.filter((item) => !item.read).length
  const title =
    titles[location.pathname] ?? (location.pathname.startsWith('/instances') ? t('instances.title') : '')

  return (
    <header className="glass drag flex h-12 shrink-0 items-center justify-between border-b border-[var(--color-border-subtle)] pl-[76px] pr-2.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <IconButton
          label={collapsed ? '展开侧栏' : '收起侧栏'}
          className="no-drag size-7"
          onClick={() => void toggleSidebar()}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </IconButton>
        <span className="truncate text-[12px] font-medium text-[var(--color-text-secondary)]">{title}</span>
      </div>
      <div className="no-drag flex items-center gap-1">
        {updates?.updateAvailable ? <Pill tone="blue">新版本 {updates.latestVersion}</Pill> : null}
        <IconButton
          label={notificationsOpen ? '隐藏通知' : '显示通知'}
          className="relative size-8"
          onClick={toggleNotifications}
        >
          {notificationsOpen ? <Bell className="size-4" /> : <BellOff className="size-4" />}
          {unread > 0 ? (
            <span className="absolute right-1.5 top-1.5 flex min-w-3.5 items-center justify-center rounded-full bg-accent-500 px-1 text-[9px] font-semibold leading-[14px] text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </IconButton>
      </div>
    </header>
  )
}
