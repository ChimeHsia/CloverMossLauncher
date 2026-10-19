import { BrowserWindow } from 'electron'

type EmitListener = (channel: string, payload: unknown) => void
const listeners = new Set<EmitListener>()

export function emit(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
  for (const listener of listeners) {
    try {
      listener(channel, payload)
    } catch {
      // event listeners must not break the sender
    }
  }
}

export function onEmit(listener: EmitListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
