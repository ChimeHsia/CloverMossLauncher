import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Settings, TrainingHost } from '@shared/types'
import { paths } from '../lib/paths'

const FILE = () => join(paths.root(), 'training-hosts.json')
let remote: TrainingHost[] | null = null

function load(): TrainingHost[] {
  if (remote) return remote
  try {
    if (!existsSync(FILE())) {
      remote = []
      return remote
    }
    const parsed = JSON.parse(readFileSync(FILE(), 'utf8')) as TrainingHost[]
    remote = Array.isArray(parsed) ? parsed : []
  } catch {
    remote = []
  }
  return remote
}

function persist(): void {
  try {
    writeFileSync(FILE(), JSON.stringify(load(), null, 2), 'utf8')
  } catch {
    // best effort
  }
}

export function listTrainingHosts(settings: Settings): TrainingHost[] {
  const local: TrainingHost = {
    id: 'local',
    name: '本机',
    kind: 'local',
    trainerRoot: paths.trainerRoot(settings.trainerRoot),
    status: 'unchecked',
  }
  return [local, ...load()]
}

export interface SaveTrainingHostInput {
  id?: string
  name: string
  host: string
  user: string
  port?: number
  identityFile?: string
  trainerRoot: string
}

export function saveTrainingHost(input: SaveTrainingHostInput): TrainingHost {
  const hosts = load()
  const existing = input.id ? hosts.find((host) => host.id === input.id) : undefined
  const next: TrainingHost = {
    id: existing?.id ?? `ssh-${randomUUID().slice(0, 8)}`,
    name: input.name.trim() || input.host,
    kind: 'ssh',
    host: input.host.trim(),
    user: input.user.trim(),
    port: input.port ?? 22,
    identityFile: input.identityFile?.trim() || undefined,
    trainerRoot: input.trainerRoot.trim(),
    status: 'unchecked',
    lastCheckedAt: undefined,
  }
  if (existing) Object.assign(existing, next)
  else remote = [...hosts, next]
  persist()
  return next
}

export function removeTrainingHost(id: string): void {
  remote = load().filter((host) => host.id !== id)
  persist()
}
