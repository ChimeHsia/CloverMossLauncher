import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { BranchInfo, CommitInfo, Settings } from '@shared/types'
import { emit } from '../lib/events'
import { paths } from '../lib/paths'
import { mirrorHealthy } from '../lib/mirror-health'
import { DEFAULT_SOURCE } from '../lib/mirror-source'
import { firstLine, run, tail } from '../lib/run'
import { Events } from '@shared/channels'
import { applyGitMirror, getLastNetwork } from './network'
import { getRecommendedCommit } from './updates'

export { DEFAULT_SOURCE }

const ensuring = new Map<string, Promise<void>>()

function progress(phase: string, message: string): void {
  emit(Events.gitProgress, { phase, message, at: new Date().toISOString() })
}

async function cloneMirror(source: string, settings: Settings): Promise<void> {
  await mkdir(paths.git(), { recursive: true })
  const mirrorUrl = applyGitMirror(source, settings.gitMirror ?? getLastNetwork()?.selected.git ?? null)
  progress('clone', `正在克隆 ${mirrorUrl}`)
  const result = await run('git', ['clone', '--bare', '--progress', mirrorUrl, paths.mirror(source)], {
    timeoutMs: 240_000,
  })
  if (result.code !== 0) {
    if (mirrorUrl !== source) {
      progress('clone', '镜像失败，回退直连 GitHub')
      await rm(paths.mirror(source), { recursive: true, force: true })
      const direct = await run('git', ['clone', '--bare', '--progress', source, paths.mirror(source)], {
        timeoutMs: 240_000,
      })
      if (direct.code === 0) return
      throw new Error(`克隆失败：${tail(direct.stderr) || firstLine(direct.stdout)}`)
    }
    throw new Error(`克隆失败：${tail(result.stderr) || firstLine(result.stdout)}`)
  }
}

export async function ensureMirror(settings: Settings, source = DEFAULT_SOURCE): Promise<void> {
  // 同一来源共享进行中的任务，不同来源使用独立目录。
  const key = paths.mirror(source)
  const pending = ensuring.get(key)
  if (pending) return pending

  const task = (async () => {
    const mirror = paths.mirror(source)

    // 无可用分支时重建，保留 HEAD 悬空但分支完好的镜像。
    if (!(await mirrorHealthy(mirror, run))) {
      await rm(mirror, { recursive: true, force: true })
      await cloneMirror(source, settings)
      if (!(await mirrorHealthy(mirror, run))) throw new Error('克隆后的仓库没有可用分支')
      return
    }

    progress('fetch', '正在拉取最新分支与提交')
    const result = await run(
      'git',
      ['-C', mirror, 'fetch', '--prune', 'origin', '+refs/heads/*:refs/heads/*'],
      { timeoutMs: 180_000 },
    )
    if (result.code !== 0) {
      // fetch 失败不代表镜像坏了：已有对象仍然可用，离线仍可创建实例与回滚。
      // 因此只上报进度、不抛错也不删除镜像；若镜像确实损坏，下一次
      // mirrorHealthy() 会返回 false 并触发重建。
      progress('fetch', `拉取最新分支失败，使用本地缓存：${firstLine(result.stderr) || firstLine(result.stdout)}`)
    }
  })().finally(() => ensuring.delete(key))

  ensuring.set(key, task)
  return task
}

export async function listBranches(source = DEFAULT_SOURCE): Promise<BranchInfo[]> {
  const result = await run(
    'git',
    ['-C', paths.mirror(source), 'for-each-ref', '--format=%(refname:short)|%(objectname)|%(HEAD)', 'refs/heads'],
    { timeoutMs: 10_000 },
  )
  if (result.code !== 0) {
    throw new Error(`读取分支失败：${firstLine(result.stderr) || firstLine(result.stdout)}`)
  }
  const main = firstLine(
    (
      await run('git', ['-C', paths.mirror(source), 'rev-parse', '--verify', 'refs/heads/main'], { timeoutMs: 5000 })
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

export async function listCommits(branch: string, limit = 60, source = DEFAULT_SOURCE): Promise<CommitInfo[]> {
  const safe = branch.replace(/[^A-Za-z0-9._/-]/g, '')
  const result = await run(
    'git',
    ['-C', paths.mirror(source), 'log', `-n${limit}`, '--format=%H%x1f%h%x1f%ct%x1f%s%x1f%an', safe],
    { timeoutMs: 15_000 },
  )
  if (result.code !== 0) throw new Error(`读取提交失败：${firstLine(result.stderr) || firstLine(result.stdout)}`)
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

export async function commitExists(sha: string, source = DEFAULT_SOURCE): Promise<boolean> {
  const result = await run('git', ['-C', paths.mirror(source), 'cat-file', '-e', `${sha}^{commit}`], { timeoutMs: 5000 })
  return result.code === 0
}

export async function createWorktree(sha: string, destination: string, source = DEFAULT_SOURCE): Promise<void> {
  const result = await run('git', ['-C', paths.mirror(source), 'worktree', 'add', '--detach', destination, sha], {
    timeoutMs: 90_000,
  })
  if (result.code !== 0) throw new Error(`创建实例失败：${tail(result.stderr)}`)
}

export async function removeWorktree(destination: string, source = DEFAULT_SOURCE): Promise<void> {
  await run('git', ['-C', paths.mirror(source), 'worktree', 'remove', '--force', destination], { timeoutMs: 30_000 })
  await rm(destination, { recursive: true, force: true })
  await run('git', ['-C', paths.mirror(source), 'worktree', 'prune'], { timeoutMs: 10_000 })
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

export async function branchStableSha(source = DEFAULT_SOURCE): Promise<string | null> {
  const result = await run('git', ['-C', paths.mirror(source), 'rev-parse', '--verify', 'refs/heads/main'], { timeoutMs: 5000 })
  return result.code === 0 ? firstLine(result.stdout) || null : null
}
