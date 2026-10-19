import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Announcement, Settings, UpdateState } from '@shared/types'
import { paths } from '../lib/paths'
import { getLastNetwork } from './network'
import { getSettings, updateSettings } from './settings'

interface RawAnnouncement {
  id: string
  level: Announcement['level']
  title: string
  body_markdown?: string
  body_url?: string
  starts_at?: string
  ends_at?: string | null
  dismissible?: boolean
  pinned?: boolean
  action?: Announcement['action']
}

interface ReleaseManifest {
  schema_version: number
  app: { channel: 'stable' | 'beta'; version: string; min_supported?: string; published_at?: string }
  announcements?: RawAnnouncement[]
  sources?: {
    moss?: { repo?: string; branch?: string; recommended_commit?: string }
    git_mirrors?: string[]
    pip_indexes?: string[]
    hf_endpoints?: string[]
    manifest_mirrors?: string[]
  }
}

const DEFAULT_BASES = [
  'https://raw.githubusercontent.com/CloverIris/CloverMossLauncher/main',
  'https://cdn.jsdelivr.net/gh/CloverIris/CloverMossLauncher@main',
  'https://ghproxy.net/https://raw.githubusercontent.com/CloverIris/CloverMossLauncher/main',
]

export function localReleaseDir(): string | null {
  const candidates = [
    join(app.getAppPath(), 'release'),
    join(app.getAppPath(), '..', '..', 'release'),
    join(process.cwd(), 'release'),
  ]
  for (const dir of candidates) {
    if (existsSync(join(dir, 'manifest.json'))) return dir
  }
  return null
}

async function fetchText(url: string, timeoutMs = 6000): Promise<string> {
  const response = await fetch(url, {
    headers: { 'user-agent': 'CloverMoss-Launcher/0.1' },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return await response.text()
}

function parseManifest(text: string): ReleaseManifest {
  const parsed = JSON.parse(text) as ReleaseManifest
  if (!parsed || parsed.schema_version !== 1 || !parsed.app?.version) {
    throw new Error('清单格式不合法')
  }
  return parsed
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('-')[0]!.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const pb = b.split('-')[0]!.split('.').map((part) => Number.parseInt(part, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff > 0 ? 1 : -1
  }
  return 0
}

async function loadManifest(): Promise<{ manifest: ReleaseManifest; source: UpdateState['manifestSource'] }> {
  const local = localReleaseDir()
  if (local) {
    try {
      return { manifest: parseManifest(readFileSync(join(local, 'manifest.json'), 'utf8')), source: 'local' }
    } catch {
      // fall through to remote
    }
  }

  const cached = join(paths.cache(), 'release.json')
  const bases = new Set<string>(DEFAULT_BASES)
  const selected = getLastNetwork()?.selected.manifest
  if (selected) bases.add(selected)

  for (const base of bases) {
    try {
      const manifest = parseManifest(await fetchText(`${base.replace(/\/$/, '')}/release/manifest.json`))
      return { manifest, source: 'remote' }
    } catch {
      // try next
    }
  }

  if (existsSync(cached)) {
    try {
      const raw = JSON.parse(readFileSync(cached, 'utf8')) as { manifest: ReleaseManifest }
      return { manifest: raw.manifest, source: 'cache' }
    } catch {
      // ignore
    }
  }

  throw new Error('无法读取更新清单（本地/远程/缓存均不可用）')
}

async function resolveBody(localDir: string | null, raw: RawAnnouncement): Promise<string> {
  if (raw.body_markdown) return raw.body_markdown
  if (raw.body_url) {
    if (localDir && raw.body_url.includes('CloverIris/CloverMossLauncher')) {
      const readme = join(localDir, 'README.md')
      if (existsSync(readme)) return readFileSync(readme, 'utf8')
    }
    try {
      return await fetchText(raw.body_url)
    } catch {
      return '公告内容暂时无法加载。'
    }
  }
  return ''
}

export async function checkUpdates(settings?: Settings): Promise<UpdateState> {
  const current = getSettings()
  const effective = settings ?? current
  const checkedAt = new Date().toISOString()

  try {
    const { manifest, source } = await loadManifest()
    const local = localReleaseDir()
    const now = Date.now()
    const dismissed = new Set(effective.dismissedAnnouncements)

    const announcements: Announcement[] = []
    for (const raw of manifest.announcements ?? []) {
      if (dismissed.has(raw.id)) continue
      if (raw.starts_at && Date.parse(raw.starts_at) > now) continue
      if (raw.ends_at && Date.parse(raw.ends_at) < now) continue
      announcements.push({
        id: raw.id,
        level: raw.level,
        title: raw.title,
        body: await resolveBody(local, raw),
        bodyUrl: raw.body_url,
        startsAt: raw.starts_at,
        endsAt: raw.ends_at ?? null,
        dismissible: raw.dismissible ?? true,
        pinned: raw.pinned ?? false,
        action: raw.action,
      })
    }
    announcements.sort((a, b) => Number(b.pinned) - Number(a.pinned))

    try {
      const { writeFileSync, mkdirSync } = await import('node:fs')
      mkdirSync(paths.cache(), { recursive: true })
      writeFileSync(join(paths.cache(), 'release.json'), JSON.stringify({ manifest, fetchedAt: checkedAt }, null, 2))
    } catch {
      // cache is best effort
    }

    return {
      checkedAt,
      currentVersion: app.getVersion(),
      latestVersion: manifest.app.version,
      updateAvailable: compareVersions(manifest.app.version, app.getVersion()) > 0,
      channel: manifest.app.channel,
      manifestSource: source,
      announcements,
    }
  } catch (error) {
    return {
      checkedAt,
      currentVersion: app.getVersion(),
      latestVersion: null,
      updateAvailable: false,
      channel: 'stable',
      manifestSource: 'none',
      announcements: [],
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export function getRecommendedCommit(): string | null {
  const local = localReleaseDir()
  if (local) {
    try {
      const manifest = parseManifest(readFileSync(join(local, 'manifest.json'), 'utf8'))
      return manifest.sources?.moss?.recommended_commit ?? null
    } catch {
      // fall through
    }
  }
  try {
    const cached = JSON.parse(readFileSync(join(paths.cache(), 'release.json'), 'utf8')) as {
      manifest?: ReleaseManifest
    }
    return cached.manifest?.sources?.moss?.recommended_commit ?? null
  } catch {
    return null
  }
}

export function dismissAnnouncement(id: string): void {
  const settings = getSettings()
  updateSettings({ dismissedAnnouncements: [...settings.dismissedAnnouncements, id] })
}
