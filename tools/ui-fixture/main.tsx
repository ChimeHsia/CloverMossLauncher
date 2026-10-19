import './styles.css'
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { Ipc } from '../../apps/desktop/src/shared/channels'
import type { Settings } from '../../apps/desktop/src/shared/types'
import { Field, Input, Modal, Select, Sheet, Spinner, Switch, Textarea } from '../../apps/desktop/src/renderer/src/components/ui'
import { SettingsPage } from '../../apps/desktop/src/renderer/src/pages/Settings'
import { HomePage } from '../../apps/desktop/src/renderer/src/pages/Home'
import { useApp } from '../../apps/desktop/src/renderer/src/store'

let savedSettings: Settings = {
  theme: 'system', uiAnimation: 'system', language: 'zh-CN', networkMode: 'auto', gitMirror: null,
  pipIndex: null, hfEndpoint: null, modelsRoot: null, pythonPath: null,
  autoCheckUpdates: false, desktopNotifications: false, updateChannel: 'stable',
  dismissedAnnouncements: [], dismissedUpdateVersion: null, sidebarCollapsed: false,
  galleryRoots: [], homeBackground: null, trainerRoot: null, disabledDevices: [], deviceLabels: {},
}
window.clover = {
  platform: 'win32', version: '0.1.0', acrylic: false, windowKind: 'launcher', channel: 'dev',
  on: () => () => undefined,
  async invoke<T>(channel: string, payload?: unknown): Promise<T> {
    if (channel === Ipc.settingsUpdate) savedSettings = { ...savedSettings, ...payload as Partial<Settings> }
    const data = channel === Ipc.settingsUpdate ? savedSettings : channel === Ipc.appInfo || channel === Ipc.envScan ? null : []
    return { ok: true, data } as T
  },
}
useApp.setState({ settings: savedSettings, ready: true })

function Fixture(): React.JSX.Element {
  const [modal, setModal] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [value, setValue] = useState('a')
  const [checked, setChecked] = useState(false)
  const [view, setView] = useState('controls')
  const settings = useApp((state) => state.settings)
  return (
    <>
      <nav className="flex gap-2">
        <button id="view-controls" onClick={() => setView('controls')}>Controls</button>
        <button id="view-settings" onClick={() => setView('settings')}>Settings</button>
        <button id="view-home" onClick={() => setView('home')}>Home</button>
        <button id="toggle-sidebar" onClick={() => void useApp.getState().toggleSidebar()}>Sidebar</button>
      </nav>
      <output id="saved-settings" hidden>{JSON.stringify(settings)}</output>
      {view === 'settings' ? <SettingsPage /> : view === 'home' ? <HomePage /> : (
        <div style={{ transform: 'translateX(20px)', backdropFilter: 'blur(2px)', width: 400, overflow: 'hidden' }}>
          <input id="typography" className="text-[10.5px] font-mono leading-5" />
          <button id="button-typography" className="text-[11px] font-medium">Typography</button>
          <Field label="Shared input" hint="Field hint"><Input /></Field>
          <Switch aria-label="Shared switch" checked={checked} onCheckedChange={setChecked} />
          <Spinner className="motion-probe" />
          <button id="open-modal" onClick={() => setModal(true)}>Open modal</button>
          <button id="outside">Outside</button>
          <Modal open={modal} onClose={() => setModal(false)} title="Modal" description="Description">
            <input id="inside" aria-label="Inside" />
            <Field label="Shared select">
              <Select value={value} onValueChange={setValue} options={[
                { value: 'a', label: 'First' }, { value: 'b', label: 'Second' },
                { value: 'disabled', label: 'Disabled', disabled: true },
              ]} />
            </Field>
            <output id="selected-value">{value}</output>
            <Field label="Shared textarea"><Textarea /></Field>
            <button id="open-sheet" onClick={() => setSheet(true)}>Open sheet</button>
            <Sheet open={sheet} onClose={() => setSheet(false)} title="Sheet">
              <input id="sheet-input" aria-label="Sheet input" />
            </Sheet>
          </Modal>
        </div>
      )}
    </>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><MemoryRouter><Fixture /></MemoryRouter></StrictMode>)
