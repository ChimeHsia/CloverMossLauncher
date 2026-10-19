import {
  Boxes,
  Download,
  Home,
  Package,
  Settings as SettingsIcon,
  Sprout,
  Stethoscope,
  type LucideIcon,
} from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import { t, type MessageKey } from '../lib/i18n'
import { useApp } from '../store'
import { cn, Pill, StatusDot } from './ui'

interface NavItem {
  to: string
  key: MessageKey
  icon: LucideIcon
  end?: boolean
  soon?: boolean
}

const navItems: NavItem[] = [
  { to: '/', key: 'nav.home', icon: Home, end: true },
  { to: '/instances', key: 'nav.instances', icon: Boxes },
  { to: '/models', key: 'nav.models', icon: Package },
  { to: '/run', key: 'nav.run', icon: Download, soon: true },
  { to: '/diagnostics', key: 'nav.diagnostics', icon: Stethoscope, soon: true },
]

export function Sidebar(): React.JSX.Element {
  const instances = useApp((state) => state.instances)
  const downloads = useApp((state) => state.downloads)
  const env = useApp((state) => state.env)
  const activeDownloads = downloads.filter((task) => task.state === 'running' || task.state === 'queued').length

  return (
    <aside className="glass flex w-52 shrink-0 flex-col border-r border-[var(--color-border-subtle)] px-2.5 py-3">
      <nav className="flex flex-col gap-0.5">
        {navItems.map((item) => {
          const Icon = item.icon
          const count =
            item.to === '/instances' ? instances.length : item.to === '/models' ? activeDownloads : 0
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end ?? false}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition',
                  isActive && !item.soon
                    ? 'bg-[var(--color-surface)] font-medium text-[var(--color-text)] shadow-sm'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)]/70 hover:text-[var(--color-text)]',
                  item.soon && 'opacity-45',
                )
              }
              onClick={(event) => {
                if (item.soon) event.preventDefault()
              }}
            >
              <Icon className="size-4" strokeWidth={1.9} />
              <span className="flex-1">{t(item.key)}</span>
              {count > 0 ? (
                <span className="rounded-full bg-[var(--color-surface-tertiary)] px-1.5 text-[10.5px] leading-4 text-[var(--color-text-secondary)]">
                  {count}
                </span>
              ) : null}
              {item.soon ? <span className="text-[10px]">soon</span> : null}
            </NavLink>
          )
        })}
      </nav>

      <div className="mt-auto space-y-2 px-1 pt-3">
        <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)]/60 p-2.5">
          <div className="flex items-center gap-2">
            <StatusDot status={env ? (env.gpu.available ? 'ok' : 'warn') : 'unknown'} />
            <span className="truncate text-[11.5px] text-[var(--color-text-secondary)]">
              {env ? env.gpu.name : '正在检测设备'}
            </span>
          </div>
          {env ? (
            <div className="mt-1.5 flex items-center justify-between text-[10.5px] text-[var(--color-text-tertiary)]">
              <span>{(env.device.memoryTotal / 1024 ** 3).toFixed(0)} GB 内存</span>
              <span>{(env.device.diskFree / 1024 ** 3).toFixed(0)} GB 可用</span>
            </div>
          ) : null}
        </div>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition',
              isActive
                ? 'bg-[var(--color-surface)] font-medium text-[var(--color-text)] shadow-sm'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)]/70 hover:text-[var(--color-text)]',
            )
          }
        >
          <SettingsIcon className="size-4" strokeWidth={1.9} />
          {t('nav.settings')}
        </NavLink>
        <div className="flex items-center justify-between px-2 pb-1 text-[10.5px] text-[var(--color-text-tertiary)]">
          <span className="inline-flex items-center gap-1">
            <Sprout className="size-3" /> {t('app.name')}
          </span>
          <Pill tone="neutral">{env?.appVersion ?? '0.1.0'}</Pill>
        </div>
      </div>
    </aside>
  )
}

const titles: Record<string, string> = {
  '/': t('home.title'),
  '/instances': t('instances.title'),
  '/models': t('models.title'),
  '/settings': t('settings.title'),
  '/run': t('nav.run'),
  '/diagnostics': t('nav.diagnostics'),
}

export function Topbar(): React.JSX.Element {
  const location = useLocation()
  const updates = useApp((state) => state.updates)
  const scanning = useApp((state) => state.scanning)
  const title = titles[location.pathname] ?? (location.pathname.startsWith('/instances') ? t('instances.title') : '')

  return (
    <header className="glass drag flex h-12 shrink-0 items-center justify-between border-b border-[var(--color-border-subtle)] pl-20 pr-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-[12.5px] font-medium text-[var(--color-text-secondary)]">{title}</span>
        {scanning ? (
          <span className="text-[11px] text-[var(--color-text-tertiary)]">· 检测中</span>
        ) : null}
      </div>
      <div className="no-drag flex items-center gap-2">
        {updates?.updateAvailable ? (
          <Pill tone="moss">新版本 {updates.latestVersion} 可用</Pill>
        ) : null}
        {updates?.manifestSource === 'local' ? <Pill tone="neutral">开发模式</Pill> : null}
      </div>
    </header>
  )
}
