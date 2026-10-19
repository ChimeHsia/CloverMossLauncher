import { createHash } from 'node:crypto'

export const DEFAULT_SOURCE = 'https://github.com/OpenMOSS/MOSS-Image'

export function mirrorDirectoryName(source = DEFAULT_SOURCE): string {
  // 保留默认仓库的旧路径，已有 worktree 的 gitdir 无需迁移。
  if (source === DEFAULT_SOURCE) return 'moss-image.git'
  return `moss-image-${createHash('sha256').update(source).digest('hex').slice(0, 12)}.git`
}
