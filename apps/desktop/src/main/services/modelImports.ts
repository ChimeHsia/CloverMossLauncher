import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'

export type ImportedModelRole = 'full' | 'dit' | 'text_encoder' | 'vae' | 'support'

export interface ImportedModelFile {
  id: string
  name: string
  path: string
  relativePath: string
  sha256: string
  size: number
  mtimeMs: number
  role: ImportedModelRole
  importedAt: string
}

interface ImportIndex {
  schema_version: 1
  models: ImportedModelFile[]
}

export interface ImportFolderResult {
  added: number
  duplicates: number
}

const modelExtensions = new Set(['.safetensors', '.ckpt', '.pt', '.pth', '.bin', '.gguf', '.onnx'])
const skippedDirectories = new Set([
  '.git',
  '.venv',
  'venv',
  'node_modules',
  '__pycache__',
  'cache',
  'input',
  'output',
  'temp',
])
const maxDepth = 12
const maxFiles = 5000

function isImportedModelFile(value: unknown): value is ImportedModelFile {
  if (!value || typeof value !== 'object') return false
  const model = value as Partial<ImportedModelFile>
  return (
    typeof model.id === 'string' &&
    typeof model.name === 'string' &&
    typeof model.path === 'string' &&
    typeof model.relativePath === 'string' &&
    typeof model.sha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(model.sha256) &&
    Number.isSafeInteger(model.size) &&
    (model.size ?? 0) > 0 &&
    typeof model.mtimeMs === 'number' &&
    Number.isFinite(model.mtimeMs) &&
    ['full', 'dit', 'text_encoder', 'vae', 'support'].includes(model.role ?? '') &&
    typeof model.importedAt === 'string'
  )
}

export async function readImportedModels(indexFile: string): Promise<ImportedModelFile[]> {
  let content: string
  try {
    content = await readFile(indexFile, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  const index = JSON.parse(content) as Partial<ImportIndex>
  if (index.schema_version !== 1 || !Array.isArray(index.models) || !index.models.every(isImportedModelFile)) {
    throw new Error('本地模型导入记录无效')
  }
  return index.models
}

async function writeImportedModels(indexFile: string, models: ImportedModelFile[]): Promise<void> {
  await mkdir(dirname(indexFile), { recursive: true })
  const temporary = `${indexFile}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, JSON.stringify({ schema_version: 1, models }, null, 2), 'utf8')
    await rename(temporary, indexFile)
  } finally {
    await rm(temporary, { force: true })
  }
}

function roleFor(relativePath: string): ImportedModelRole {
  const directories = relativePath.split(/[\\/]/).slice(0, -1).map((part) => part.toLowerCase())
  if (directories.some((part) => /^(vae|vaes)$/.test(part))) return 'vae'
  if (directories.some((part) => /^(text[_-]?encoders?|clip)$/.test(part))) return 'text_encoder'
  if (directories.some((part) => /^(diffusion[_-]?models?|unet|checkpoints?)$/.test(part))) return 'dit'
  return 'full'
}

async function scanDirectory(root: string): Promise<string[]> {
  const found: string[] = []
  async function visit(directory: string, depth: number): Promise<void> {
    if (depth > maxDepth) return
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !skippedDirectories.has(entry.name.toLowerCase())) {
          await visit(join(directory, entry.name), depth + 1)
        }
      } else if (entry.isFile() && modelExtensions.has(extname(entry.name).toLowerCase())) {
        found.push(join(directory, entry.name))
        if (found.length > maxFiles) throw new Error(`所选目录中模型文件超过 ${maxFiles} 个，请选择更具体的文件夹`)
      }
    }
  }
  await visit(root, 0)
  return found
}

function hashFile(file: string): Promise<string> {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(file)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolveHash(hash.digest('hex')))
    stream.on('error', reject)
  })
}

export async function importModelFolder(directory: string, indexFile: string): Promise<ImportFolderResult> {
  const root = await realpath(resolve(directory))
  if (!(await stat(root)).isDirectory()) throw new Error('请选择模型文件夹')
  const files = await scanDirectory(root)
  if (files.length === 0) throw new Error('所选目录中没有可导入的模型文件')

  const models = await readImportedModels(indexFile)
  const byHash = new Map(models.map((model) => [model.sha256, model]))
  let added = 0
  let duplicates = 0
  for (const file of files) {
    const before = await stat(file)
    if (!before.isFile() || before.size <= 0) continue
    const sha256 = await hashFile(file)
    const after = await stat(file)
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
      throw new Error(`模型文件在导入时发生变化：${relative(root, file)}`)
    }
    const existing = byHash.get(sha256)
    if (existing) {
      try {
        if (
          existing.path === file ||
          (await stat(existing.path)).isFile() &&
            (await hashFile(existing.path)) === sha256
        ) {
          duplicates += 1
          continue
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
    const relativePath = relative(root, file)
    const record: ImportedModelFile = {
      id: `local-file-${sha256.slice(0, 20)}`,
      name: basename(file),
      path: file,
      relativePath,
      sha256,
      size: after.size,
      mtimeMs: after.mtimeMs,
      role: roleFor(relativePath),
      importedAt: new Date().toISOString(),
    }
    if (existing) models.splice(models.indexOf(existing), 1, record)
    else models.push(record)
    byHash.set(sha256, record)
    added += 1
  }
  if (!added && !duplicates) throw new Error('没有找到可读取的非空模型文件')
  await writeImportedModels(indexFile, models)
  return { added, duplicates }
}

export async function removeImportedModel(indexFile: string, id: string): Promise<void> {
  const models = await readImportedModels(indexFile)
  const next = models.filter((model) => model.id !== id)
  if (next.length === models.length) throw new Error('本地导入模型记录不存在')
  await writeImportedModels(indexFile, next)
}

export async function verifyImportedModelFile(model: ImportedModelFile, sha256: string, size: number): Promise<boolean> {
  if (model.sha256 !== sha256 || model.size !== size) return false
  try {
    const info = await stat(model.path)
    return info.isFile() && info.size === size && (await hashFile(model.path)) === sha256
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}
