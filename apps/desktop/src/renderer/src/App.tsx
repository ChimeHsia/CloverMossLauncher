import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Sidebar, Topbar } from './components/layout'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/ui'
import { HomePage } from './pages/Home'
import { InstanceDetailPage } from './pages/InstanceDetail'
import { InstancesPage } from './pages/Instances'
import { ModelsPage } from './pages/Models'
import { SettingsPage } from './pages/Settings'
import { useApp } from './store'

export function App(): React.JSX.Element {
  const init = useApp((state) => state.init)

  useEffect(() => {
    void init()
  }, [init])

  return (
    <ToastProvider>
      <HashRouter>
        <div className="flex h-full flex-col bg-[var(--color-surface-secondary)] text-[var(--color-text)]">
          <Topbar />
          <div className="flex min-h-0 flex-1">
            <Sidebar />
            <main className="min-w-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-[1060px] px-7 py-6">
                <ErrorBoundary>
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/instances" element={<InstancesPage />} />
                  <Route path="/instances/:id" element={<InstanceDetailPage />} />
                  <Route path="/models" element={<ModelsPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
                </ErrorBoundary>
              </div>
            </main>
          </div>
        </div>
      </HashRouter>
    </ToastProvider>
  )
}
