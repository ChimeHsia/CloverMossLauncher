import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Diagnostic } from '@shared/types'
import { Events } from '@shared/channels'
import { emit } from '../lib/events'
import { paths } from '../lib/paths'
import { loadRules, toDiagnostic } from './parsers'

const FILE = () => join(paths.root(), 'diagnostics.json')
const MAX = 200
let items: Diagnostic[] | null = null
const toastTimes: number[] = []

function ensure(): Diagnostic[] {
  if (!items) items = load()
  return items
}

function load(): Diagnostic[] {
  try {
    if (!existsSync(FILE())) return []
    const parsed = JSON.parse(readFileSync(FILE(), 'utf8')) as Diagnostic[]
    if (!Array.isArray(parsed)) return []
    return parsed.slice(0, MAX).map((item) => {
      if (!/\{\d+\}/.test(`${item.title} ${item.explain}`)) return item
      const rule = loadRules().find((candidate) => candidate.id === item.ruleId)
      if (!rule) return item
      const rendered = toDiagnostic(rule, item.raw, item.jobId)
      return { ...item, title: rendered.title, explain: rendered.explain }
    })
  } catch {
    return []
  }
}

function persist(): void {
  try {
    mkdirSync(paths.root(), { recursive: true })
    writeFileSync(FILE(), JSON.stringify(ensure(), null, 2), 'utf8')
  } catch {
    // diagnostics are best-effort
  }
}

function allowToast(severity: Diagnostic['severity']): boolean {
  if (severity === 'info') return false
  const now = Date.now()
  while (toastTimes.length && now - toastTimes[0]! > 5 * 60_000) toastTimes.shift()
  if (toastTimes.length >= 3) return false
  toastTimes.push(now)
  return true
}

export interface DiagnosticInput {
  jobId?: string
  ruleId: string
  severity: Diagnostic['severity']
  title: string
  explain: string
  solutions: Diagnostic['solutions']
  raw: string
  signature: string
  toast?: boolean
}

export function pushDiagnostic(input: DiagnosticInput): Diagnostic {
  const current = ensure()
  const now = new Date().toISOString()
  const existing = current.find((item) => item.signature === input.signature)
  if (existing) {
    existing.count += 1
    existing.lastAt = now
    existing.raw = input.raw
    existing.title = input.title
    existing.explain = input.explain
    items = [existing, ...current.filter((item) => item.id !== existing.id)]
    emit(Events.diagnostic, { ...existing, toast: false })
    persist()
    return { ...existing, toast: false }
  }
  const diagnostic: Diagnostic = {
    ...input,
    id: randomUUID(),
    count: 1,
    firstAt: now,
    lastAt: now,
    toast: input.toast === false ? false : allowToast(input.severity),
  }
  items = [diagnostic, ...current].slice(0, MAX)
  emit(Events.diagnostic, diagnostic)
  persist()
  return diagnostic
}

export function listDiagnostics(): Diagnostic[] {
  return ensure().map((item) => ({ ...item }))
}

export function dismissDiagnostic(id: string): void {
  items = ensure().filter((item) => item.id !== id)
  persist()
}

export function clearDiagnostics(): void {
  items = []
  persist()
}
