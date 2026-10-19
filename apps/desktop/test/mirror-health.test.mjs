import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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

test('healthy bare mirror 判定为健康', async () => {
  const mirror = mirrorPath('healthy')
  await git(['clone', '-q', '--bare', source, mirror])
  assert.equal(await mirrorHealthy(mirror, exec), true)
})

test('目录不存在 判定为不健康', async () => {
  assert.equal(await mirrorHealthy(join(root, 'nope.git'), exec), false)
})

test('HEAD 指向非法引用 判定为不健康', async () => {
  const mirror = mirrorPath('invalid-head')
  await git(['clone', '-q', '--bare', source, mirror])
  writeFileSync(join(mirror, 'HEAD'), 'ref: refs/heads/.invalid\n')
  assert.equal(await mirrorHealthy(mirror, exec), false)
})

test('refs 与 objects 残缺（克隆中断）判定为不健康', async () => {
  const mirror = mirrorPath('interrupted')
  await git(['clone', '-q', '--bare', source, mirror])
  rmSync(join(mirror, 'refs'), { recursive: true, force: true })
  rmSync(join(mirror, 'objects'), { recursive: true, force: true })
  mkdirSync(join(mirror, 'refs', 'heads'), { recursive: true })
  mkdirSync(join(mirror, 'objects'), { recursive: true })
  assert.equal(await mirrorHealthy(mirror, exec), false)
})

test('只有 HEAD 文件、没有分支 判定为不健康', async () => {
  const mirror = mirrorPath('empty')
  const empty = join(root, 'empty-source.git')
  mkdirSync(empty, { recursive: true })
  await git(['init', '-q', '--bare'], empty)
  await git(['clone', '-q', '--bare', empty, mirror])
  // 关键断言：HEAD 文件确实存在，旧逻辑会因此误判为已安装
  const headExists = await import('node:fs').then((fs) => fs.existsSync(join(mirror, 'HEAD')))
  assert.equal(headExists, true)
  assert.equal(await mirrorHealthy(mirror, exec), false)
})

test('fetch 失败时不得删除仍可用的镜像（离线缓存保护）', async () => {
  const mirror = mirrorPath('keep-on-fetch-fail')
  await git(['clone', '-q', '--bare', source, mirror])
  await git(['-C', mirror, 'remote', 'set-url', 'origin', 'https://127.0.0.1:1/nope.git'])

  const fetchResult = await git(['-C', mirror, 'fetch', '--prune', 'origin', '+refs/heads/*:refs/heads/*'])
  assert.notEqual(fetchResult.code, 0, '预期 fetch 失败')

  // 镜像本身仍然健康，不应被重建逻辑删掉
  assert.equal(await mirrorHealthy(mirror, exec), true)
})
