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
 * 不能只看 HEAD 文件是否存在：`git clone --bare` 在开始阶段就会创建 HEAD，
 * 克隆中断、远端为空仓库、`git init --bare` 后 fetch 失败，都会留下
 * 「HEAD 存在但 refs/objects 残缺」的状态，此时 existsSync 会误判为已安装，
 * 之后只走 fetch 分支，永远不会重新克隆。
 *
 * 这里改成真的问 git：
 * 1. HEAD 文件存在；
 * 2. HEAD 能解析到一个真实存在的 commit（`HEAD^{commit}` 比 `HEAD` 严格，
 *    后者在对象缺失时仍会输出 SHA 并返回 0）；
 * 3. 至少有一个分支。
 */
export async function mirrorHealthy(mirror: string, exec: MirrorExec): Promise<boolean> {
  if (!existsSync(join(mirror, 'HEAD'))) return false

  const head = await exec('git', ['-C', mirror, 'rev-parse', '--verify', 'HEAD^{commit}'], {
    timeoutMs: 5_000,
  })
  if (head.code !== 0) return false

  const refs = await exec('git', ['-C', mirror, 'for-each-ref', '--format=%(refname)', 'refs/heads'], {
    timeoutMs: 5_000,
  })
  if (refs.code !== 0) return false

  return refs.stdout.trim().length > 0
}
