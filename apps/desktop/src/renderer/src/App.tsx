import { useEffect, useRef, useState } from 'react'
import defaultHomeBackground from './assets/home-background.png'
import { Events } from '@shared/channels'
import type { Diagnostic } from '@shared/types'
import { onEvent } from './lib/api'
import { openGradioUi } from './lib/openGradio'
import { useToast } from './components/ui'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { CreatorSidebar, Sidebar } from './components/layout'
import { AppTitlebar } from './components/AppTitlebar'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/ui'
import { NotificationPanel } from './components/NotificationPanel'
import { UpdateDialog } from './components/UpdateDialog'
import { Oobe } from './components/Oobe'
import { HomePage } from './pages/Home'
import { GalleryPage } from './pages/Gallery'
import { DiagnosticsPage } from './pages/Diagnostics'
import { DevicesPage } from './pages/Devices'
import { StudioPage } from './pages/Studio'
import { InstanceDetailPage } from './pages/InstanceDetail'
import { InstancesPage } from './pages/Instances'
import { ModelsPage } from './pages/Models'
import { SettingsPage } from './pages/Settings'
import { TerminalPage } from './pages/Terminal'
import { TrainingPage } from './pages/Training'
import { TrainerWindow } from './pages/TrainerWindow'
import { useApp } from './store'
import { cloverUrl } from './lib/clover'

function useAppBackground(): React.CSSProperties {
  const settings = useApp((state) => state.settings)
  const custom = Boolean(settings?.homeBackground)
  const source = custom ? cloverUrl(settings!.homeBackground!) : defaultHomeBackground
  return {
    backgroundImage: `linear-gradient(rgba(18,20,24,${custom ? 0.78 : 0.55}), rgba(18,20,24,${custom ? 0.90 : 0.70})), url("${source}")`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundColor: '#191b1f',
  }
}

function LauncherShell(): React.JSX.Element {
  const location = useLocation()
  const toast = useToast()
  const settings = useApp((state) => state.settings)
  const notificationsOpen = useApp((state) => state.notificationsOpen)
  const notifications = useApp((state) => state.notifications)
  const toggleSidebar = useApp((state) => state.toggleSidebar)
  const setNotificationsOpen = useApp((state) => state.setNotificationsOpen)
  const onboarding = useApp((state) => state.onboarding)
  const jobs = useApp((state) => state.jobs)
  const [oobeDismissed, setOobeDismissed] = useState(false)
  const openedGradioJobs = useRef<Set<string>>(new Set())
  const backgroundStyle = useAppBackground()

  useEffect(() => {
    if (location.pathname !== '/') setNotificationsOpen(false)
  }, [location.pathname, setNotificationsOpen])

  useEffect(
    () =>
      onEvent<Diagnostic>(Events.diagnostic, (diagnostic) => {
        if (diagnostic.toast) {
          toast.push(diagnostic.title, diagnostic.severity === 'warning' ? 'info' : 'error')
        }
      }),
    [toast],
  )

  // Auto-open belongs to the launcher shell, not the Home page: navigating away
  // while a Gradio job is loading must not lose the ready/open behavior.
  useEffect(() => {
    for (const job of jobs) {
      if (job.workspace !== 'official' || job.state !== 'running' || !job.url) continue
      if (openedGradioJobs.current.has(job.id)) continue
      openedGradioJobs.current.add(job.id)
      void openGradioUi(job.url, job.gradio?.openMode ?? 'browser', job.caseName)
        .then((result) => {
          if (result === 'copied') toast.push('Gradio 地址已复制', 'success')
        })
        .catch((error: unknown) =>
          toast.push(error instanceof Error ? error.message : String(error), 'error'),
        )
    }
  }, [jobs, toast])

  return (
    <div className="app-shell flex h-full flex-col text-[var(--color-text)]">
      <AppTitlebar
        kind="launcher"
        collapsed={settings?.sidebarCollapsed ?? false}
        onToggleSidebar={() => void toggleSidebar()}
        notificationsOpen={notificationsOpen}
        onToggleNotifications={() => setNotificationsOpen(!notificationsOpen)}
        unread={notifications.filter((item) => !item.read).length}
      />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main
          className="content-surface min-w-0 flex-1 overflow-y-auto"
          style={backgroundStyle}
        >
          <div className="mx-auto flex min-h-[calc(100vh-44px)] w-full max-w-[1100px] flex-col px-6 py-5">
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/instances" element={<InstancesPage />} />
                <Route path="/instances/:id" element={<InstanceDetailPage />} />
                <Route path="/models" element={<ModelsPage />} />
                <Route path="/training" element={<TrainingPage />} />
                <Route path="/gallery" element={<GalleryPage />} />
                <Route path="/diagnostics" element={<DiagnosticsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </ErrorBoundary>
          </div>
        </main>
        <NotificationPanel />
      </div>
      <UpdateDialog />
      {onboarding && !onboarding.ready ? (
        <Oobe
          open={!oobeDismissed}
          status={onboarding}
          onClose={() => setOobeDismissed(true)}
        />
      ) : null}
    </div>
  )
}

function CreatorShell(): React.JSX.Element {
  const backgroundStyle = useAppBackground()
  return (
    <div className="app-shell flex h-full flex-col text-[var(--color-text)]">
      <AppTitlebar kind="creator" />
      <div className="flex min-h-0 flex-1">
        <CreatorSidebar />
        <main className="content-surface min-w-0 flex-1 overflow-y-auto" style={backgroundStyle}>
          <div className="mx-auto w-full max-w-[1180px] px-6 py-5">
            <ErrorBoundary>
              <Routes>
                <Route path="/studio" element={<StudioPage />} />
                <Route path="/gallery" element={<GalleryPage />} />
                <Route path="*" element={<Navigate to="/studio" replace />} />
              </Routes>
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  )
}

function TrainerShell(): React.JSX.Element {
  const backgroundStyle = useAppBackground()
  return (
    <div className="app-shell flex h-full flex-col text-[var(--color-text)]">
      <AppTitlebar kind="trainer" appName="Kohaku Trainer" appTag="external" />
      <div className="min-h-0 flex-1 overflow-y-auto" style={backgroundStyle}>
        <TrainerWindow />
      </div>
    </div>
  )
}

function TerminalShell(): React.JSX.Element {
  const backgroundStyle = useAppBackground()
  return (
    <div className="app-shell flex h-full flex-col text-[var(--color-text)]">
      <AppTitlebar kind="terminal" />
      <div className="min-h-0 flex-1" style={backgroundStyle}>
        <ErrorBoundary>
          <TerminalPage />
        </ErrorBoundary>
      </div>
    </div>
  )
}

function DevicesShell(): React.JSX.Element {
  const backgroundStyle = useAppBackground()
  return (
    <div className="app-shell flex h-full flex-col text-[var(--color-text)]">
      <AppTitlebar kind="devices" appName="CloverMoss Devices" />
      <div className="min-h-0 flex-1 overflow-y-auto" style={backgroundStyle}>
        <div className="mx-auto w-full max-w-[1100px] px-6 py-5">
          <ErrorBoundary>
            <DevicesPage />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  )
}

export function App(): React.JSX.Element {
  const init = useApp((state) => state.init)
  const kind = window.clover.windowKind

  useEffect(() => {
    void init()
  }, [init])

  return (
    <ToastProvider>
      {kind === 'creator' ? (
        <HashRouter>
          <CreatorShell />
        </HashRouter>
      ) : kind === 'devices' ? (
        <DevicesShell />
      ) : kind === 'terminal' ? (
        <TerminalShell />
      ) : kind === 'trainer' ? (
        <TrainerShell />
      ) : (
        <HashRouter>
          <LauncherShell />
        </HashRouter>
      )}
    </ToastProvider>
  )
}
