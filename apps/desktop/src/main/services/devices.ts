import { execFileSync } from 'node:child_process'
import os from 'node:os'
import type { LaunchDevice, Settings } from '@shared/types'

function command(file: string, args: string[]): string {
  try {
    return execFileSync(file, args, { encoding: 'utf8', timeout: 2500, stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

export function listDevices(settings?: Pick<Settings, 'disabledDevices' | 'deviceLabels'>): LaunchDevice[] {
  const devices: LaunchDevice[] = []
  const cpu = os.cpus()[0]?.model?.trim() || 'CPU'

  if (process.platform === 'darwin' && process.arch === 'arm64') {
    const chip = command('sysctl', ['-n', 'machdep.cpu.brand_string']) || 'Apple Silicon'
    devices.push({
      id: 'mps',
      name: chip,
      kind: 'mps',
      detail: 'Metal / MPS',
      memoryBytes: os.totalmem(),
      available: true,
    })
  }

  if (process.platform !== 'darwin') {
    const rows = command('nvidia-smi', [
      '--query-gpu=index,name,memory.total',
      '--format=csv,noheader,nounits',
    ])
      .split('\n')
      .filter(Boolean)
    for (const row of rows) {
      const [index, name, memory] = row.split(',').map((part) => part.trim())
      if (!index || !name) continue
      const mb = Number.parseInt(memory ?? '', 10)
      devices.push({
        id: `cuda:${index}`,
        name,
        kind: 'cuda',
        detail: `CUDA · ${Number.isFinite(mb) ? `${Math.round(mb / 1024)} GB` : '显存未知'}`,
        memoryBytes: Number.isFinite(mb) ? mb * 1024 * 1024 : undefined,
        available: true,
      })
    }
  }

  devices.push({
    id: 'cpu',
    name: cpu,
    kind: 'cpu',
    detail: 'CPU',
    memoryBytes: os.totalmem(),
    available: true,
  })
  const disabled = new Set(settings?.disabledDevices ?? [])
  return devices.map((device) => ({
    ...device,
    name: settings?.deviceLabels?.[device.id] || device.name,
    available: device.available && !disabled.has(device.id),
  }))
}
