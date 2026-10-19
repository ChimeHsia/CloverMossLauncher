import { app } from 'electron'
import { mirrorDirectoryName } from './mirror-source'
import { mkdirSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

export function root(): string {
  return app.getPath('userData')
}

export function modelsRoot(custom?: string | null): string {
  return custom ? resolve(custom) : join(root(), 'models')
}

export const paths = {
  root,
  settings: () => join(root(), 'settings.json'),
  announcements: () => join(root(), 'announcements.json'),
  git: () => join(root(), 'git'),
  mirror: (source?: string) => join(root(), 'git', mirrorDirectoryName(source)),
  instances: () => join(root(), 'instances'),
  instance: (id: string) => join(root(), 'instances', id),
  runtimes: () => join(root(), 'runtimes'),
  runtime: (id: string) => join(root(), 'runtimes', id),
  managedPython: () => join(root(), 'runtimes', 'python'),
  models: (custom?: string | null) => modelsRoot(custom),
  hub: (custom?: string | null) => join(modelsRoot(custom), 'hf', 'hub'),
  adapters: (custom?: string | null) => join(modelsRoot(custom), 'adapters'),
  downloads: () => join(root(), 'downloads'),
  cache: () => join(root(), 'cache'),
  logs: () => join(root(), 'logs'),
  trainerRoot: (custom?: string | null) => (custom ? resolve(custom) : join(root(), 'trainer')),
  trainerGit: () => join(root(), 'trainer', 'git'),
  trainerMirror: () => join(root(), 'trainer', 'git', 'kohaku-trainer.git'),
  trainerVersions: () => join(root(), 'trainer', 'versions'),
  trainerVersion: (id: string) => join(root(), 'trainer', 'versions', id),
  trainerRuntimes: () => join(root(), 'trainer', 'runtimes'),
  trainerRuntime: (id: string) => join(root(), 'trainer', 'runtimes', id),
}

export function ensureDirs(customModelsRoot?: string | null): void {
  const dirs = [
    paths.root(),
    paths.git(),
    paths.instances(),
    paths.runtimes(),
    paths.managedPython(),
    paths.models(customModelsRoot),
    paths.hub(customModelsRoot),
    paths.adapters(customModelsRoot),
    paths.downloads(),
    paths.cache(),
    paths.logs(),
    paths.trainerGit(),
    paths.trainerVersions(),
    paths.trainerRuntimes(),
  ]
  for (const dir of dirs) mkdirSync(dir, { recursive: true })
}

export function isInside(base: string, target: string): boolean {
  const rel = relative(resolve(base), resolve(target))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}
