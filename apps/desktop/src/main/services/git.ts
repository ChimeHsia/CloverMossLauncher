import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { BranchInfo, CommitInfo, Settings } from '@shared/types'
import { emit } from '../lib/events'
import { paths } from '../lib/paths'
import { firstLine, run, tail } from '../lib/run'
import { Events } from '@shared/channels'
import { applyGitMirror, getLastNetwork } from './network'
import { getRecommendedCommit } from './updates'

export const DEFAULT_SOURCE = 'https://github.com/OpenMOSS/MOSS-Image'

let ensuring: Promise<void> | null = null

function progress(phase: string, message: string): void {
  emit(Events.gitProgress, { phase, message, at: new Date().toISOString() })
}

async function cloneMirror(source: string, settings: Settings): Promise<void> {
  const mirrorUrl = applyGitMirror(source, settings.gitMirror ?? getLastNetwork()?.selected.git ?? null)
  progress('clone', `正在克隆 ${mirrorUrl}`)
  const result = await run('git', ['clone', '--bare', '--progress', mirrorUrl, paths.mirror()], {
    timeoutMs: 240_000,
  })
  if (result.code !== 0) {
    if (mirrorUrl !== source) {
      progress('clone', '镜像失败，回退直连 GitHub')
      await rm(paths.mirror(), { recursive: true, force: true })
      const direct = await run('git', ['clone', '--bare', '--progress', source, paths.mirror()], {
        timeoutMs: 240_000,
      })
      if (direct.code === 0) return
      throw new Error(`克隆失败：${tail(direct.stderr) || firstLine(direct.stdout)}`)
    }
    throw new Error(`克隆失败：${tail(result.stderr) || firstLine(result.stdout)}`)
  }
}

export async function ensureMirror(settings: Settings, source = DEFAULT_SOURCE): Promise<void> {
  if (ensuring) return ensuring
  ensuring = (async () => {
    if (!existsSync(join(paths.mirror(), 'HEAD'))) {
      await cloneMirror(source, settings)
      return
    }
    progress('fetch', '正在拉取最新分支与提交')
    const result = await run(
      'git',
      ['-C', paths.mirror(), 'fetch', '--prune', 'origin', '+refs/heads/*:refs/heads/*'],
      { timeoutMs: 180_000 },
    )
    if (result.code !== 0) {
      progress('fetch', `拉取失败：${firstLine(result.stderr)}`)
    }
  })().finally(() => {
    ensuring = null
  })
  return ensuring
}

export async function listBranches(): Promise<BranchInfo[]> {
  const result = await run(
    'git',
    ['-C', paths.mirror(), 'for-each-ref', '--format=%(refname:short)|%(objectname)|%(HEAD)', 'refs/heads'],
    { timeoutMs: 10_000 },
  )
  if (result.code !== 0) return []
  const main = firstLine(
    (
      await run('git', ['-C', paths.mirror(), 'rev-parse', '--verify', 'refs/heads/main'], { timeoutMs: 5000 })
    ).stdout,
  )
  const recommended = getRecommendedCommit()
  return result.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name = '', sha = '', head = ''] = line.split('|')
      return {
        name,
        sha,
        isDefault: name === 'main' || head.trim() === '*',
        isStable: name === 'main' && (sha === main || (!!recommended && sha.startsWith(recommended))),
      }
    })
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name))
}

export async function listCommits(branch: string, limit = 60): Promise<CommitInfo[]> {
  const safe = branch.replace(/[^A-Za-z0-9._/-]/g, '')
  const result = await run(
    'git',
    ['-C', paths.mirror(), 'log', `-n${limit}`, '--format=%H%x1f%h%x1f%ct%x1f%s%x1f%an', safe],
    { timeoutMs: 15_000 },
  )
  if (result.code !== 0) return []
  return result.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha = '', short = '', date = '', subject = '', author = ''] = line.split('\u001f')
      const timestamp = Number.parseInt(date, 10) || 0
      return {
        sha,
        short,
        date: new Date(timestamp * 1000).toISOString(),
        subject,
        author,
      }
    })
}

export async function commitExists(sha: string): Promise<boolean> {
  const result = await run('git', ['-C', paths.mirror(), 'cat-file', '-e', `${sha}^{commit}`], { timeoutMs: 5000 })
  return result.code === 0
}

export async function createWorktree(sha: string, destination: string): Promise<void> {
  const result = await run('git', ['-C', paths.mirror(), 'worktree', 'add', '--detach', destination, sha], {
    timeoutMs: 90_000,
  })
  if (result.code !== 0) throw new Error(`创建实例失败：${tail(result.stderr)}`)
}

export async function removeWorktree(destination: string): Promise<void> {
  await run('git', ['-C', paths.mirror(), 'worktree', 'remove', '--force', destination], { timeoutMs: 30_000 })
  await rm(destination, { recursive: true, force: true })
  await run('git', ['-C', paths.mirror(), 'worktree', 'prune'], { timeoutMs: 10_000 })
}

export async function checkout(destination: string, sha: string): Promise<void> {
  const result = await run('git', ['-C', destination, 'checkout', '--detach', sha], { timeoutMs: 30_000 })
  if (result.code !== 0) throw new Error(`切换版本失败：${tail(result.stderr)}`)
}

export async function isDirty(destination: string): Promise<boolean> {
  const result = await run(
    'git',
    ['-C', destination, 'status', '--porcelain', '--', '.', ':(exclude)instance.json', ':(exclude)outputs'],
    { timeoutMs: 10_000 },
  )
  return result.stdout.trim().length > 0
}

export async function branchStableSha(): Promise<string | null> {
  const result = await run('git', ['-C', paths.mirror(), 'rev-parse', '--verify', 'refs/heads/main'], { timeoutMs: 5000 })
  return result.code === 0 ? firstLine(result.stdout) || null : null
}
