import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { LaunchCase } from '@shared/types'
import { paths } from '../lib/paths'
import { getInstance } from './instances'

const FILE = () => join(paths.root(), 'cases.json')
let cases: LaunchCase[] | null = null

function ensure(): LaunchCase[] {
  if (cases) return cases
  try {
    if (!existsSync(FILE())) {
      cases = []
      return cases
    }
    const parsed = JSON.parse(readFileSync(FILE(), 'utf8')) as LaunchCase[]
    cases = Array.isArray(parsed) ? parsed : []
  } catch {
    cases = []
  }
  return cases
}

function persist(): void {
  try {
    writeFileSync(FILE(), JSON.stringify(ensure(), null, 2), 'utf8')
  } catch {
    // best effort
  }
}

export function listCases(): LaunchCase[] {
  return ensure()
    .slice()
    .sort((a, b) => (b.lastUsedAt ?? b.createdAt).localeCompare(a.lastUsedAt ?? a.createdAt))
}

export async function saveCase(input: Omit<LaunchCase, 'id' | 'createdAt' | 'lastUsedAt'> & { id?: string }): Promise<LaunchCase> {
  const instance = await getInstance(input.instanceId)
  if (!instance) throw new Error('实例不存在')
  const current = ensure()
  const existing = input.id ? current.find((item) => item.id === input.id) : undefined
  if (existing) {
    Object.assign(existing, {
      name: input.name?.trim() || existing.name,
      instanceId: input.instanceId,
      backend: input.backend,
      deviceId: input.deviceId,
      profile: input.profile,
      port: input.port ?? null,
      extraArgs: input.extraArgs ?? '',
      lastUsedAt: new Date().toISOString(),
    })
    persist()
    return { ...existing }
  }
  const created: LaunchCase = {
    id: `case-${randomUUID().slice(0, 8)}`,
    name: input.name?.trim() || `${instance.name} · ${input.backend === 'official' ? '官方' : 'Clover'}`,
    instanceId: input.instanceId,
    backend: input.backend,
    deviceId: input.deviceId,
    profile: input.profile,
    port: input.port ?? null,
    extraArgs: input.extraArgs ?? '',
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
  }
  cases = [created, ...current]
  persist()
  return { ...created }
}

export function removeCase(id: string): void {
  cases = ensure().filter((item) => item.id !== id)
  persist()
}
