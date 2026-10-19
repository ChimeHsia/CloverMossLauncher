/// <reference types="vite/client" />

declare global {
  interface Window {
    clover: {
      invoke<T = unknown>(channel: string, payload?: unknown): Promise<T>
      on(channel: string, callback: (data: unknown) => void): () => void
      platform: string
      version: string
      acrylic: boolean
      windowKind: 'launcher' | 'creator' | 'terminal' | 'trainer'
      channel: string
    }
  }
}

export {}
