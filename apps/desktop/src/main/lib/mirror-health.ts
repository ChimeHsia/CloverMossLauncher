import { existsSync } from 'node:fs'
import { join } from 'node:path'

export type MirrorExec = (
  command: string,
  args: string[],
  options?: { timeoutMs?: number },
) => Promise<{ code: number; stdout: string }>

/**
 * 判断一个 bare git 镜像是否真的可用。
 *
 * 不能只看 HEAD 文件是否存在：`git clone` 在极早期被中断时会留下
 * `ref: refs/heads/.invalid` 且 `refs/heads` 为空的状态，此时 HEAD 文件存在，
 * 旧逻辑会误判为已安装，之后只走 fetch 分支，遇到远端不可用就永远停在坏状态。
 *
 * 但也不能要求 `HEAD^{commit}` 必须成功：远端 HEAD 指向不存在的分支时，
 * `git clone --bare` 会留下 `HEAD -> refs/heads/nope`，而 `refs/heads/main`
 * 和其它分支完全正常，镜像可用（listBranches / worktree 均正常）。此时把镜像
 * 判为损坏并删除重建是不必要的破坏。
 *
 * 因此以「是否存在可解析的本地分支」为准：HEAD 只是当前检出的默认引用，
 * 对 bare 镜像的实际用途（for-each-ref / worktree add <sha>）并不关键。
 */
export async function mirrorHealthy(mirror: string, exec: MirrorExec): Promise<boolean> {
  if (!existsSync(join(mirror, 'HEAD'))) return false

  const refs = await exec('git', ['-C', mirror, 'for-each-ref', '--format=%(refname)', 'refs/heads'], {
    timeoutMs: 5_000,
  })
  if (refs.code !== 0) return false

  const branches = refs.stdout.split('\n').map((line) => line.trim()).filter(Boolean)
  if (branches.length === 0) return false

  // 至少有一个分支能解析到真实存在的 commit（防 refs 存在但 objects 缺失）
  for (const branch of branches) {
    const resolved = await exec('git', ['-C', mirror, 'rev-parse', '--verify', `${branch}^{commit}`], {
      timeoutMs: 5_000,
    })
    if (resolved.code === 0) return true
  }
  return false
}
