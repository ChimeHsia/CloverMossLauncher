import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { LaunchRow } from '@shared/types'
import { paths } from '../lib/paths'

const FILE = () => join(paths.root(), 'launch-queue.json')
let rows: LaunchRow[] | null = null

function ensure(): LaunchRow[] {
  if (rows) return rows
  try {
    if (!existsSync(FILE())) {
      rows = []
      return rows
    }
    const parsed = JSON.parse(readFileSync(FILE(), 'utf8')) as LaunchRow[]
    rows = Array.isArray(parsed) ? parsed : []
  } catch {
    rows = []
  }
  // A restarted process cannot resume a running inference job. Keep queued rows;
  // mark interrupted starting/running rows failed so the UI does not imply progress.
  let changed = false
  for (const row of rows) {
    if (row.state === 'starting' || row.state === 'running') {
      row.state = 'failed'
      row.error = '应用重启，任务已中断'
      changed = true
    }
  }
  if (changed) persist()
  return rows
}

function persist(): void {
  try {
    writeFileSync(FILE(), JSON.stringify(ensure(), null, 2), 'utf8')
  } catch {
    // best effort
  }
}

export function listLaunchRows(): LaunchRow[] {
  return ensure().slice().sort((a, b) => (b.startedAt ?? b.queuedAt).localeCompare(a.startedAt ?? a.queuedAt))
}

export function upsertLaunchRow(row: LaunchRow): LaunchRow {
  const current = ensure()
  rows = [row, ...current.filter((item) => item.id !== row.id)]
  persist()
  return { ...row }
}

export function removeLaunchRow(id: string): void {
  rows = ensure().filter((row) => row.id !== id)
  persist()
}
