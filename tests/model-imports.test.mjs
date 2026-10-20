import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  importModelFolder,
  readImportedModels,
  removeImportedModel,
  verifyImportedModelFile,
} from '../apps/desktop/src/main/services/modelImports.ts'

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'clover-model-imports-'))
  try {
    await run(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('imports recognized files, infers ComfyUI roles, and deduplicates by SHA256', () =>
  fixture(async (root) => {
    const models = join(root, 'ComfyUI', 'models')
    const ditDir = join(models, 'diffusion_models')
    const vaeDir = join(models, 'vae')
    await mkdir(ditDir, { recursive: true })
    await mkdir(vaeDir, { recursive: true })
    await writeFile(join(ditDir, 'model.safetensors'), 'same-content')
    await writeFile(join(vaeDir, 'duplicate.safetensors'), 'same-content')
    await writeFile(join(vaeDir, 'vae.safetensors'), 'vae-content')
    await writeFile(join(models, 'readme.txt'), 'ignored')
    const index = join(root, 'imports', 'index.json')

    const result = await importModelFolder(models, index)
    const records = await readImportedModels(index)

    assert.deepEqual(result, { added: 2, duplicates: 1 })
    assert.equal(records.length, 2)
    assert.equal(records.find((model) => model.name === 'model.safetensors')?.role, 'dit')
    assert.equal(records.find((model) => model.name === 'vae.safetensors')?.role, 'vae')
    assert.equal(await verifyImportedModelFile(records[0], records[0].sha256, records[0].size), true)
  }))

test('reimport skips existing content and removing an import never deletes the source file', () =>
  fixture(async (root) => {
    const models = join(root, 'models')
    await mkdir(models)
    const source = join(models, 'checkpoint.safetensors')
    await writeFile(source, 'checkpoint')
    const index = join(root, 'imports', 'index.json')
    await importModelFolder(models, index)

    assert.deepEqual(await importModelFolder(models, index), { added: 0, duplicates: 1 })
    const [record] = await readImportedModels(index)
    await removeImportedModel(index, record.id)

    assert.deepEqual(await readImportedModels(index), [])
    assert.equal(await readFile(source, 'utf8'), 'checkpoint')
  }))

test('rejects a directory without supported model files', () =>
  fixture(async (root) => {
    const index = join(root, 'imports', 'index.json')
    await assert.rejects(
      importModelFolder(root, index),
      /没有可导入的模型文件/,
    )
  }))
