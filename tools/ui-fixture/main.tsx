import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Modal, Sheet } from '../../apps/desktop/src/renderer/src/components/ui'
import '../../apps/desktop/src/renderer/src/styles.css'

function Fixture(): React.JSX.Element {
  const [modal, setModal] = useState(false)
  const [sheet, setSheet] = useState(false)
  return (
    <div style={{ transform: 'translateX(20px)', backdropFilter: 'blur(2px)', width: 400, overflow: 'hidden' }}>
      <input id="typography" className="text-[10.5px] font-mono leading-5" />
      <button id="button-typography" className="text-[11px] font-medium">Typography</button>
      <button id="open-modal" onClick={() => setModal(true)}>Open modal</button>
      <button id="outside">Outside</button>
      <Modal open={modal} onClose={() => setModal(false)} title="Modal" description="Description">
        <input id="inside" aria-label="Inside" />
        <button id="open-sheet" onClick={() => setSheet(true)}>Open sheet</button>
        <Sheet open={sheet} onClose={() => setSheet(false)} title="Sheet">
          <input id="sheet-input" aria-label="Sheet input" />
        </Sheet>
      </Modal>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><Fixture /></StrictMode>)
