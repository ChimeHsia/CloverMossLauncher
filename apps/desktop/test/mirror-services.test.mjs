import assert from 'node:assert/strict'
import { execFile, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { after, test } from 'node:test'
import { loadTs } from './helpers/load-ts.mjs'

const main = fileURLToPath(new URL('../src/main/', import.meta.url))
const root = mkdtempSync(join(tmpdir(), 'clover-mirror-services-'))
after(() => rmSync(root, { recursive: true, force: true }))

function run(command, args, options = {}) {
  return new Promise((resolve) => execFile(command, args, { windowsHide: true, timeout: 30_000, ...options }, (error, stdout, stderr) => {
    resolve({ code: error ? (error.code ?? -1) : 0, stdout, stderr })
  }))
}

async function git(...args) {
  const result = await run('git', args)
  assert.equal(result.code, 0, result.stderr)
  return result.stdout.trim()
}

async function source(name, empty = false) {
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  await git('init', '-q', '-b', 'main', dir)
  if (!empty) {
    writeFileSync(join(dir, 'content.txt'), name)
    await git('-C', dir, 'add', '.')
    await git('-C', dir, '-c', 'user.name=test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', 'commit', '-qm', name)
  }
  return pathToFileURL(dir).href
}

function services(name) {
  const data = join(root, name)
  const events = []
  const mocks = {
    electron: { app: { getPath: () => data } },
    '@shared/channels': { Events: { gitProgress: 'gitProgress' } },
    '../lib/events': { emit: (_channel, event) => events.push(event) },
    './network': { applyGitMirror: (source) => source, getLastNetwork: () => null },
    './updates': { getRecommendedCommit: () => null },
  }
  return {
    git: loadTs(join(main, 'services/git.ts'), mocks),
    trainer: loadTs(join(main, 'services/trainerGit.ts'), mocks),
    paths: loadTs(join(main, 'lib/paths.ts'), mocks).paths,
    mocks,
    events,
  }
}

function corrupt(mirror) {
  writeFileSync(join(mirror, 'HEAD'), 'ref: refs/heads/.invalid\n')
  rmSync(join(mirror, 'refs'), { recursive: true, force: true })
  mkdirSync(join(mirror, 'refs', 'heads'), { recursive: true })
  rmSync(join(mirror, 'packed-refs'), { force: true })
}

test('本地：来源独立、同源并发合并、离线保留缓存并可创建和删除 worktree', async () => {
  const a = await source('local-A')
  const b = await source('local-B')
  const { git: service, paths, mocks, events } = services('local-data')
  assert.equal(paths.mirror(), join(paths.git(), 'moss-image.git'))
  assert.notEqual(paths.mirror(a), paths.mirror(b))
  await Promise.all([service.ensureMirror({}, a), service.ensureMirror({}, a), service.ensureMirror({}, b)])
  assert.equal(events.filter((event) => event.phase === 'clone').length, 2)
  const aSha = (await service.listCommits('main', 5, a))[0].sha
  const bSha = (await service.listCommits('main', 5, b))[0].sha
  assert.notEqual(aSha, bSha)
  assert.equal(await service.commitExists(bSha, a), false)
  assert.equal(await service.commitExists(bSha, b), true)
  assert.equal(await service.branchStableSha(b), bSha)
  assert.equal((await service.listBranches(b))[0].sha, bSha)
  const mirror = paths.mirror(b)
  await git('-C', mirror, 'remote', 'set-url', 'origin', join(root, 'offline'))
  // 切换网络镜像不改变按原始来源计算的缓存路径。
  mocks['./network'].applyGitMirror = () => { throw new Error('不应重新克隆') }
  writeFileSync(join(mirror, 'keep'), 'cached')
  await service.ensureMirror({ gitMirror: 'https://proxy.invalid/' }, b)
  assert.equal(readFileSync(join(mirror, 'keep'), 'utf8'), 'cached')
  assert.ok(events.some((event) => event.message.includes('使用本地缓存')))
  const tree = join(root, 'local-worktree')
  await service.createWorktree(bSha, tree, b)
  assert.equal(readFileSync(join(tree, 'content.txt'), 'utf8'), 'local-B')
  await service.removeWorktree(tree, b)
  assert.equal(existsSync(tree), false)
})

test('本地：损坏镜像重建，悬空 HEAD 保留，空源和查询失败可见', async () => {
  const a = await source('local-repair')
  const empty = await source('local-empty', true)
  const { git: service, paths } = services('repair-data')
  await service.ensureMirror({}, a)
  corrupt(paths.mirror(a))
  await service.ensureMirror({}, a)
  assert.equal((await service.listCommits('main', 1, a))[0].subject, 'local-repair')
  writeFileSync(join(paths.mirror(a), 'HEAD'), 'ref: refs/heads/missing\n')
  writeFileSync(join(paths.mirror(a), 'keep'), 'keep')
  await service.ensureMirror({}, a)
  assert.equal(existsSync(join(paths.mirror(a), 'keep')), true)
  await assert.rejects(service.ensureMirror({}, empty), /没有可用分支/)
  await assert.rejects(service.listBranches('missing-source'), /读取分支失败/)
  await assert.rejects(service.listCommits('missing-branch', 5, a), /读取提交失败/)
  // 查询成功但确实无分支时，仍可返回空数组。
  assert.deepEqual(await service.listBranches(empty), [])
})

test('训练器：健康检查覆盖修复、离线缓存及空源', async () => {
  const a = await source('trainer-source')
  const { trainer, mocks, events } = services('trainer-data')
  mocks['./network'].applyGitMirror = () => a
  const settings = { trainerRoot: join(root, 'trainer-install') }
  await trainer.ensureTrainerMirror(settings)
  const mirror = trainer.trainerMirror(settings)
  corrupt(mirror)
  await trainer.ensureTrainerMirror(settings)
  assert.equal((await trainer.listTrainerBranches(settings))[0].name, 'main')
  assert.equal((await trainer.listTrainerCommits(settings, 'main', 1))[0].subject, 'trainer-source')
  await assert.rejects(trainer.listTrainerCommits(settings, 'missing-branch', 1), /读取训练器提交失败/)
  await git('-C', mirror, 'remote', 'set-url', 'origin', join(root, 'offline'))
  writeFileSync(join(mirror, 'keep'), 'keep')
  await trainer.ensureTrainerMirror(settings)
  assert.equal(existsSync(join(mirror, 'keep')), true)
  assert.ok(events.some((event) => event.message.includes('使用本地缓存')))
  const sourceEmpty = await source('trainer-empty', true)
  mocks['./network'].applyGitMirror = () => sourceEmpty
  await assert.rejects(trainer.ensureTrainerMirror({ trainerRoot: join(root, 'trainer-empty-install') }), /没有可用分支/)
})

// 用本机 POSIX shell 执行真实 SSH 脚本，不依赖在线 SSH 主机。
let shell = '/bin/sh'
if (process.platform === 'win32') {
  // `where.exe git` 可能返回 <root>/cmd/git.exe 或 <root>/mingw64/bin/git.exe，
  // 两种布局下 bash 的位置不同，逐个尝试而不是假定单一层级。
  const gitExe = execFileSync('where.exe', ['git'], { encoding: 'utf8' }).split(String.fromCharCode(10))[0].trim()
  const candidates = [
    resolve(dirname(gitExe), '../bin/bash.exe'),
    resolve(dirname(gitExe), '../../bin/bash.exe'),
    resolve(dirname(gitExe), '../../usr/bin/bash.exe'),
  ]
  const found = candidates.find((candidate) => existsSync(candidate))
  if (!found) throw new Error(`找不到可用的 posix shell，已尝试：${candidates.join(', ')}`)
  shell = found
}
test('SSH 脚本：多源读取与 worktree、损坏恢复、离线和错误上报', async () => {
  const a = await source('remote-A')
  const b = await source('remote-B')
  const empty = await source('remote-empty', true)
  const { mocks } = services('remote-local-data')
  const ssh = loadTs(join(main, 'services/ssh.ts'))
  mocks['./ssh'] = { ...ssh, sshExec: (_host, command) => run(shell, ['-c', command]) }
  mocks['./runtimes'] = {}
  mocks['./trainingHosts'] = {}
  const remote = loadTs(join(main, 'services/remoteInstances.ts'), mocks)
  // 包含空格和单引号，校验命令的路径转义。
  const roots = { host: {}, instanceRoot: join(root, "remote space ' quote").replaceAll('\\', '/'), modelsRoot: '' }
  assert.ok(remote.remoteMirrorPath(roots).endsWith('/git/moss-image.git'))
  assert.notEqual(remote.remoteMirrorPath(roots, a), remote.remoteMirrorPath(roots, b))
  await remote.ensureRemoteMirror(roots, a)
  await remote.ensureRemoteMirror(roots, b)
  const aSha = (await remote.remoteBranches(roots, a))[0].sha
  const bSha = (await remote.remoteCommits(roots, 'main', 5, b))[0].sha
  assert.notEqual(aSha, bSha)
  const tree = await remote.createRemoteWorktree(roots, 'tree', bSha, b)
  assert.equal(readFileSync(join(tree, 'content.txt'), 'utf8'), 'remote-B')
  await assert.rejects(remote.createRemoteWorktree(roots, 'bad-tree', '0000000000000000000000000000000000000000', b), /worktree 失败/)
  const mirror = remote.remoteMirrorPath(roots, a)
  corrupt(mirror)
  await remote.ensureRemoteMirror(roots, a)
  assert.equal((await remote.remoteCommits(roots, 'main', 5, a))[0].sha, aSha)
  writeFileSync(join(mirror, 'HEAD'), 'ref: refs/heads/missing\n')
  writeFileSync(join(mirror, 'keep'), 'keep')
  await git('-C', mirror, 'remote', 'set-url', 'origin', join(root, 'offline'))
  await remote.ensureRemoteMirror(roots, a)
  assert.equal(existsSync(join(mirror, 'keep')), true)
  assert.equal((await remote.remoteBranches(roots, a))[0].sha, aSha)
  await assert.rejects(remote.ensureRemoteMirror(roots, empty), /没有可用分支/)
  await assert.rejects(remote.remoteBranches(roots, 'missing-source'))
  await assert.rejects(remote.remoteCommits(roots, 'missing-branch', 5, a))
})

test('提交日志失败只影响元数据，已有提交仍能创建和更新实例', async () => {
  const a = await source('metadata-source')
  const { git: service, mocks, paths } = services('metadata-data')
  await service.ensureMirror({}, a)
  const sha = (await service.listCommits('main', 1, a))[0].sha
  const metadataSources = []
  mocks['./git'] = {
    ...service,
    listCommits: async (_branch, _limit, source) => {
      metadataSources.push(source)
      throw new Error('读取提交失败')
    },
  }
  mocks['./runtimes'] = {
    ensureRuntime: async () => ({ id: 'runtime' }),
    readRuntime: async () => null,
  }
  mocks['./remoteInstances'] = {}
  mocks['./ssh'] = {}
  const instances = loadTs(join(main, 'services/instances.ts'), mocks)
  const created = await instances.createInstance({ source: a, branch: 'missing-branch', commit: sha, name: 'metadata-test', runtimeMode: 'isolated' }, {})
  assert.equal(created.commit, sha)
  assert.equal(created.source, a)
  assert.equal(created.subject, '')
  assert.equal(readFileSync(join(paths.instance(created.id), 'content.txt'), 'utf8'), 'metadata-source')
  const updated = await instances.updateInstance(created.id, sha)
  assert.equal(updated.commit, sha)
  assert.deepEqual(metadataSources, [a, a])
  // 来源必须贯穿删除流程，否则会清理错误的镜像注册。
  await instances.deleteInstance(created.id, false)
  assert.equal(existsSync(paths.instance(created.id)), false)
  assert.ok(!(await git('-C', paths.mirror(a), 'worktree', 'list', '--porcelain')).includes(created.id))
})

test('训练器提交查询失败可见，但元数据失败不阻断已有提交创建版本', async () => {
  const a = await source('trainer-metadata-source')
  const { trainer, mocks } = services('trainer-metadata-data')
  mocks['./network'].applyGitMirror = () => a
  const settings = { trainerRoot: join(root, 'trainer-metadata-install') }
  await trainer.ensureTrainerMirror(settings)
  const sha = (await trainer.listTrainerCommits(settings, 'main', 1))[0].sha
  await assert.rejects(trainer.listTrainerCommits(settings, 'missing-branch', 1), /读取训练器提交失败/)
  // 加载真实 trainers 服务与 trainerGit，让缺失分支触发真实 git log 失败。
  mocks['./trainerGit'] = trainer
  mocks['./supervisor'] = {}
  mocks['./remoteTrainer'] = {}
  mocks['./trainingHosts'] = {}
  mocks['./ssh'] = {}
  mocks['./runtimes'] = {}
  const trainers = loadTs(join(main, 'services/trainers.ts'), mocks)
  const created = await trainers.createTrainerVersion(settings, {
    branch: 'missing-branch', commit: sha, name: 'metadata-fallback',
  })
  assert.equal(created.commit, sha)
  assert.equal(created.shortCommit, sha.slice(0, 7))
  assert.equal(created.subject, '')
  assert.equal(created.author, '')
  assert.ok(Number.isFinite(Date.parse(created.commitDate)))
  assert.equal(readFileSync(join(created.path, 'content.txt'), 'utf8'), 'trainer-metadata-source')
  const record = JSON.parse(readFileSync(join(created.path, 'trainer.json'), 'utf8'))
  assert.equal(record.commit, sha)
  await assert.rejects(trainers.createTrainerVersion(settings, {
    branch: 'missing-branch', commit: '0000000000000000000000000000000000000000',
  }), /训练器提交不存在/)
})
