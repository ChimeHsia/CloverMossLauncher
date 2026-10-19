import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'

const require = createRequire(new URL('../apps/desktop/package.json', import.meta.url))
const { build } = await import(pathToFileURL(require.resolve('vite')).href)
const { default: react } = await import(pathToFileURL(require.resolve('@vitejs/plugin-react')).href)
const { default: tailwindcss } = await import(pathToFileURL(require.resolve('@tailwindcss/vite')).href)
const root = fileURLToPath(new URL('../', import.meta.url))
const output = mkdtempSync(join(tmpdir(), 'clover-ui-'))

try {
  await build({
    configFile: false,
    root: resolve(root, 'tools/ui-fixture'),
    base: './',
    resolve: {
      alias: {
        '@shared': resolve(root, 'apps/desktop/src/shared'),
        'react': dirname(require.resolve('react/package.json')),
        'react-dom': dirname(require.resolve('react-dom/package.json')),
      },
    },
    plugins: [react(), tailwindcss()],
    build: { outDir: output, emptyOutDir: true },
  })
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const result = spawnSync(require('electron'), [resolve(root, 'tools/ui-check-electron.cjs'), output], {
    env,
    stdio: 'inherit',
    timeout: 60000,
    windowsHide: true,
  })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} finally {
  rmSync(output, { recursive: true, force: true })
}
