import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const r = (p: string) => resolve(__dirname, p)

export default defineConfig({
  main: {
    resolve: {
      alias: { '@shared': r('src/shared'), '@main': r('src/main') },
    },
    build: {
      rollupOptions: {
        input: {
          index: r('src/main/index.ts'),
          backend: r('src/backend/index.ts'),
        },
      },
    },
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    resolve: {
      alias: { '@shared': r('src/shared'), '@main': r('src/main') },
    },
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    root: r('src/renderer'),
    resolve: {
      alias: { '@renderer': r('src/renderer/src'), '@shared': r('src/shared') },
    },
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: { input: r('src/renderer/index.html') },
    },
  },
})
