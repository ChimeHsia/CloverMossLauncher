import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Sidebar, Topbar } from './components/layout'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/ui'
import { NotificationPanel } from './components/NotificationPanel'
import { HomePage } from './pages/Home'
import { GalleryPage } from './pages/Gallery'
import { StudioPage } from './pages/Studio'
import { InstanceDetailPage } from './pages/InstanceDetail'
import { InstancesPage } from './pages/Instances'
import { ModelsPage } from './pages/Models'
import { SettingsPage } from './pages/Settings'
import { useApp } from './store'

function Shell(): React.JSX.Element {
  const location = useLocation()
  const setNotificationsOpen = useApp((state) => state.setNotificationsOpen)

  useEffect(() => {
    // The notification drawer is open on launch/home; close it when entering a work page.
    if (location.pathname !== '/') setNotificationsOpen(false)
  }, [location.pathname, setNotificationsOpen])

  return (
    <div className="app-shell flex h-full flex-col text-[var(--color-text)]">
      <Topbar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1120px] px-7 py-6">
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/studio" element={<StudioPage />} />
                <Route path="/gallery" element={<GalleryPage />} />
                <Route path="/instances" element={<InstancesPage />} />
                <Route path="/instances/:id" element={<InstanceDetailPage />} />
                <Route path="/models" element={<ModelsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </ErrorBoundary>
          </div>
        </main>
        <NotificationPanel />
      </div>
    </div>
  )
}

export function App(): React.JSX.Element {
  const init = useApp((state) => state.init)

  useEffect(() => {
    void init()
  }, [init])

  return (
    <ToastProvider>
      <HashRouter>
        <Shell />
      </HashRouter>
    </ToastProvider>
  )
}
