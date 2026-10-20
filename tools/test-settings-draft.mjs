import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(new URL('../apps/desktop/package.json', import.meta.url))
const ts = require('typescript')
const source = readFileSync(new URL('../apps/desktop/src/renderer/src/lib/settingsDraft.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } })
const { pendingSettings, clearSavedSettings } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)

test('sidebar and immediate saves preserve unrelated draft fields', () => {
  const settings = { sidebarCollapsed: true, galleryRoots: ['new'], gitMirror: null }
  const edits = { gitMirror: 'https://example.com/' }
  assert.deepEqual({ ...settings, ...edits }, { ...settings, gitMirror: edits.gitMirror })
  assert.deepEqual(pendingSettings(settings, edits), edits)
  assert.deepEqual(clearSavedSettings(edits, { galleryRoots: ['new'] }), edits)
})

test('save submits only edited settings, not a stale settings snapshot', () => {
  assert.deepEqual(pendingSettings({ sidebarCollapsed: true, pythonPath: null }, { pythonPath: 'python' }), { pythonPath: 'python' })
})

test('reverted fields and structurally equal arrays are not dirty', () => {
  assert.deepEqual(pendingSettings({ galleryRoots: ['a'], pythonPath: null }, { galleryRoots: ['a'], pythonPath: null }), {})
})

test('successful save clears submitted fields and preserves edits made in flight', () => {
  assert.deepEqual(clearSavedSettings({ gitMirror: 'newer', pythonPath: 'python' }, { gitMirror: 'older', pythonPath: 'python' }), { gitMirror: 'newer' })
})

test('reverting a field while its save is in flight remains an unsaved edit', () => {
  const remaining = clearSavedSettings({ pythonPath: null }, { pythonPath: 'python' })
  assert.deepEqual(pendingSettings({ pythonPath: 'python' }, remaining), { pythonPath: null })
})
