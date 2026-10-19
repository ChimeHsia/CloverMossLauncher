import { contextBridge, ipcRenderer } from 'electron'

const api = {
  invoke(channel: string, payload?: unknown): Promise<unknown> {
    return ipcRenderer.invoke(channel, payload)
  },
  on(channel: string, callback: (data: unknown) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown): void => callback(data)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },
  platform: process.platform,
  version: process.versions.electron,
  acrylic: process.argv.includes('--clover-acrylic'),
}

contextBridge.exposeInMainWorld('clover', api)
