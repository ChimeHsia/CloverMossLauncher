import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileSize, validateSnapshot, type ModelFile } from './modelFiles'

export async function legacyModelReady(path: string): Promise<boolean> {
  try {
    let root = path
    if ((await fileSize(join(path, 'model_index.json'))) < 0) {
      const sha = (await readFile(join(path, 'refs', 'main'), 'utf8')).trim()
      if (!/^[a-f0-9]{40,64}$/.test(sha)) return false
      root = join(path, 'snapshots', sha)
    }
    const files: ModelFile[] = []
    const walk = async (dir: string, prefix = ''): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const rel = prefix + entry.name
        if (entry.isDirectory()) await walk(join(dir, entry.name), `${rel}/`)
        else if (!rel.endsWith('.part'))
          files.push({ path: rel, size: await fileSize(join(dir, entry.name)), oid: null })
      }
    }
    await walk(root)
    for (const [role, folder] of [
      ['dit', 'transformer'],
      ['text_encoder', 'text_encoder'],
      ['vae', 'vae'],
      ['support', ''],
    ]) {
      if (!(await validateSnapshot(root, files, role!, folder))) return false
    }
    return true
  } catch {
    return false
  }
}
