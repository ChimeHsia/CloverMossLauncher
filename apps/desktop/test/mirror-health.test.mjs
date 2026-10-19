import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { mirrorHealthy } from '../src/main/lib/mirror-health.ts'

function git(args, cwd) {
  return new Promise((resolve) => {
    const child = spawn('git', args, { cwd, windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }))
    child.on('error', (error) => resolve({ code: -1, stdout, stderr: String(error) }))
  })
}

const exec = (command, args) => git(args, undefined)

let root
let source

test.before(async () => {
  root = mkdtempSync(join(tmpdir(), 'clover-mirror-health-'))
  source = join(root, 'source')
  mkdirSync(source, { recursive: true })
  await git(['init', '-q', '-b', 'main'], source)
  await git(['config', 'user.email', 'test@example.com'], source)
  await git(['config', 'user.name', 'test'], source)
  writeFileSync(join(source, 'readme.txt'), 'hello\n')
  await git(['add', 'readme.txt'], source)
  await git(['commit', '-qm', 'initial'], source)
})

test.after(() => {
  rmSync(root, { recursive: true, force: true })
})

function mirrorPath(name) {
  const path = join(root, `mirror-${name}.git`)
  rmSync(path, { recursive: true, force: true })
  return path
}

test('健康的 bare 镜像判定为健康', async () => {
  const mirror = mirrorPath('healthy')
  await git(['clone', '-q', '--bare', source, mirror])
  assert.equal(await mirrorHealthy(mirror, exec), true)
})

test('目录不存在判定为不健康', async () => {
  assert.equal(await mirrorHealthy(join(root, 'nope.git'), exec), false)
})

test('HEAD 文件存在但 refs 为空（clone 极早期中断）判定为不健康', async () => {
  const mirror = mirrorPath('invalid-head')
  await git(['clone', '-q', '--bare', source, mirror])
  // 复刻 git clone 极早期中断留下的状态
  writeFileSync(join(mirror, 'HEAD'), 'ref: refs/heads/.invalid\n')
  rmSync(join(mirror, 'refs'), { recursive: true, force: true })
  mkdirSync(join(mirror, 'refs', 'heads'), { recursive: true })
  rmSync(join(mirror, 'packed-refs'), { force: true })
  // 关键：HEAD 文件确实存在，旧逻辑会因此误判为已安装
  assert.equal(existsSync(join(mirror, 'HEAD')), true)
  assert.equal(await mirrorHealthy(mirror, exec), false)
})

test('有分支但 objects 缺失判定为不健康', async () => {
  const mirror = mirrorPath('lost-objects')
  await git(['clone', '-q', '--bare', source, mirror])
  rmSync(join(mirror, 'objects'), { recursive: true, force: true })
  mkdirSync(join(mirror, 'objects'), { recursive: true })
  assert.equal(await mirrorHealthy(mirror, exec), false)
})

test('HEAD 指向不存在的分支但其它分支完好，仍判定为健康（不可误删）', async () => {
  // 远端 HEAD 指向不存在分支时，git clone --bare 就会留下这种镜像，
  // 它实际可用（for-each-ref / worktree add 均正常），不应被判定为损坏。
  const brokenHeadSource = join(root, 'broken-head-source.git')
  mkdirSync(brokenHeadSource, { recursive: true })
  await git(['init', '-q', '--bare'], brokenHeadSource)
  await git(['-C', brokenHeadSource, 'fetch', source, 'refs/heads/*:refs/heads/*'])
  writeFileSync(join(brokenHeadSource, 'HEAD'), 'ref: refs/heads/does-not-exist\n')

  const mirror = mirrorPath('dangling-head')
  await git(['clone', '-q', '--bare', brokenHeadSource, mirror])
  assert.equal(await mirrorHealthy(mirror, exec), true)
})

test('空仓库（无任何分支）判定为不健康', async () => {
  const emptySource = join(root, 'empty-source.git')
  mkdirSync(emptySource, { recursive: true })
  await git(['init', '-q', '--bare'], emptySource)
  const mirror = mirrorPath('empty')
  await git(['clone', '-q', '--bare', emptySource, mirror])
  assert.equal(existsSync(join(mirror, 'HEAD')), true)
  assert.equal(await mirrorHealthy(mirror, exec), false)
})
