import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { BranchInfo, CommitInfo, Settings } from '@shared/types'
import { Events } from '@shared/channels'
import { emit } from '../lib/events'
import { paths } from '../lib/paths'
import { mirrorHealthy } from '../lib/mirror-health'
import { firstLine, run, tail } from '../lib/run'
import { applyGitMirror, getLastNetwork } from './network'

export const TRAINER_SOURCE = 'https://github.com/KohakuBlueleaf/KohakuMossTrainer'
const ensuring = new Map<string, Promise<void>>()

function root(settings: Settings): string {
  return paths.trainerRoot(settings.trainerRoot)
}

export function trainerMirror(settings: Settings): string {
  return join(root(settings), 'git', 'kohaku-trainer.git')
}

export function trainerVersionsDir(settings: Settings): string {
  return join(root(settings), 'versions')
}

export function trainerVersionDir(settings: Settings, id: string): string {
  return join(trainerVersionsDir(settings), id)
}

export function trainerRuntimesDir(settings: Settings): string {
  return join(root(settings), 'runtimes')
}

export function trainerRuntimeDir(settings: Settings, id: string): string {
  return join(trainerRuntimesDir(settings), id)
}

function progress(message: string): void {
  emit(Events.gitProgress, { phase: 'trainer', message, at: new Date().toISOString() })
}

async function cloneMirror(settings: Settings, source = TRAINER_SOURCE): Promise<void> {
  const mirror = trainerMirror(settings)
  const mirrorUrl = applyGitMirror(source, settings.gitMirror ?? getLastNetwork()?.selected.git ?? null)
  await mkdir(join(mirror, '..'), { recursive: true })
  progress(`正在克隆 ${mirrorUrl}`)
  const result = await run('git', ['clone', '--bare', '--progress', mirrorUrl, mirror], { timeoutMs: 240_000 })
  if (result.code === 0) return
  if (mirrorUrl !== source) {
    await rm(mirror, { recursive: true, force: true })
    const direct = await run('git', ['clone', '--bare', '--progress', source, mirror], { timeoutMs: 240_000 })
    if (direct.code === 0) return
    throw new Error(`训练器克隆失败：${tail(direct.stderr) || firstLine(direct.stdout)}`)
  }
  throw new Error(`训练器克隆失败：${tail(result.stderr) || firstLine(result.stdout)}`)
}

export async function ensureTrainerMirror(settings: Settings): Promise<void> {
  const key = root(settings)
  const pending = ensuring.get(key)
  if (pending) return pending
  const task = (async () => {
    const mirror = trainerMirror(settings)
    if (!(await mirrorHealthy(mirror, run))) {
      await rm(mirror, { recursive: true, force: true })
      await cloneMirror(settings)
      return
    }
    progress('正在拉取训练器分支与标签')
    const result = await run(
      'git',
      ['-C', mirror, 'fetch', '--prune', '--tags', 'origin', '+refs/heads/*:refs/heads/*'],
      { timeoutMs: 180_000 },
    )
    if (result.code !== 0) {
      // 同 git.ts：fetch 失败时保留可用镜像，只上报错误。
      throw new Error(`拉取训练器分支失败：${firstLine(result.stderr) || firstLine(result.stdout)}`)
    }
  })().finally(() => ensuring.delete(key))
  ensuring.set(key, task)
  return task
}

export async function listTrainerBranches(settings: Settings): Promise<BranchInfo[]> {
  await ensureTrainerMirror(settings)
  const mirror = trainerMirror(settings)
  const result = await run('git', ['-C', mirror, 'for-each-ref', '--format=%(refname:short)|%(objectname)', 'refs/heads'], { timeoutMs: 10_000 })
  if (result.code !== 0) return []
  const tag = await run('git', ['-C', mirror, 'rev-parse', '--verify', 'refs/tags/v0.1.0^{commit}'], { timeoutMs: 5000 })
  const stable = tag.code === 0 ? firstLine(tag.stdout) : ''
  return result.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name = '', sha = ''] = line.split('|')
      return { name, sha, isDefault: name === 'main', isStable: Boolean(stable) && sha === stable }
    })
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name))
}

export async function listTrainerCommits(settings: Settings, branch: string, limit = 60): Promise<CommitInfo[]> {
  await ensureTrainerMirror(settings)
  const safe = branch.replace(/[^A-Za-z0-9._/-]/g, '')
  const result = await run(
    'git',
    ['-C', trainerMirror(settings), 'log', `-n${limit}`, '--format=%H%x1f%h%x1f%ct%x1f%s%x1f%an', safe],
    { timeoutMs: 15_000 },
  )
  if (result.code !== 0) return []
  return result.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha = '', short = '', date = '', subject = '', author = ''] = line.split('\u001f')
      return {
        sha,
        short,
        date: new Date((Number.parseInt(date, 10) || 0) * 1000).toISOString(),
        subject,
        author,
      }
    })
}

export async function trainerTagSha(settings: Settings, tag = 'v0.1.0'): Promise<string | null> {
  const result = await run('git', ['-C', trainerMirror(settings), 'rev-parse', '--verify', `refs/tags/${tag}^{commit}`], { timeoutMs: 5000 })
  return result.code === 0 ? firstLine(result.stdout) || null : null
}

export async function trainerCommitExists(settings: Settings, sha: string): Promise<boolean> {
  const result = await run('git', ['-C', trainerMirror(settings), 'cat-file', '-e', `${sha}^{commit}`], { timeoutMs: 5000 })
  return result.code === 0
}

export async function createTrainerWorktree(settings: Settings, sha: string, destination: string): Promise<void> {
  await mkdir(trainerVersionsDir(settings), { recursive: true })
  const result = await run('git', ['-C', trainerMirror(settings), 'worktree', 'add', '--detach', destination, sha], { timeoutMs: 120_000 })
  if (result.code !== 0) throw new Error(`创建训练版本失败：${tail(result.stderr)}`)
}

export async function removeTrainerWorktree(settings: Settings, destination: string): Promise<void> {
  await run('git', ['-C', trainerMirror(settings), 'worktree', 'remove', '--force', destination], { timeoutMs: 30_000 })
  await rm(destination, { recursive: true, force: true })
  await run('git', ['-C', trainerMirror(settings), 'worktree', 'prune'], { timeoutMs: 10_000 })
}

export async function isTrainerDirty(destination: string): Promise<boolean> {
  const result = await run(
    'git',
    ['-C', destination, 'status', '--porcelain', '--', '.', ':(exclude)trainer.json', ':(exclude)runs', ':(exclude)configs/user', ':(exclude)models', ':(exclude).venv'],
    { timeoutMs: 10_000 },
  )
  return result.stdout.trim().length > 0
}
