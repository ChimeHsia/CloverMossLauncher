import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const require = createRequire(new URL('../apps/desktop/package.json', import.meta.url))
const ts = require('typescript')
function loadSource(path, imports = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const exports = {}
  new Function('require', 'exports', outputText)(
    (id) => Object.hasOwn(imports, id) ? imports[id] : require(id), exports,
  )
  return exports
}
const run = loadSource('../apps/desktop/src/main/lib/run.ts')
const ssh = loadSource('../apps/desktop/src/main/services/ssh.ts', { '../lib/run': run })
const host = { kind: 'ssh', host: 'fixture', user: 'user', port: 2222, identityFile: 'C:/My Keys/id_ed25519' }

test('SCP escapes remote spaces while preserving local paths and identity files as single arguments', () => {
  const args = ssh.scpArgs(host, '/srv/My Trainer/output file.bin', 'C:/My Outputs/result.bin')
  assert.deepEqual(args.slice(-2), ['user@fixture:/srv/My\\ Trainer/output\\ file.bin', 'C:/My Outputs/result.bin'])
  assert.equal(args[args.indexOf('-i') + 1], host.identityFile)
  assert.equal(args[args.indexOf('-P') + 1], '2222')
})

test('SCP paths without spaces are unchanged', () => {
  assert.deepEqual(ssh.scpArgs(host, '/srv/trainer/output.bin', '/tmp/output.bin').slice(-2),
    ['user@fixture:/srv/trainer/output.bin', '/tmp/output.bin'])
})

// Optional real OpenSSH round trips, with local protocol endpoints and no SSH server.
// Set CLOVER_TEST_SCP_BIN and CLOVER_TEST_SFTP_SERVER to run these checks.
const scpBin = process.env.CLOVER_TEST_SCP_BIN
const sftpServer = process.env.CLOVER_TEST_SFTP_SERVER
const remotePath = (value) => process.platform === 'win32'
  ? value.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive) => '/' + drive.toLowerCase())
  : value

for (const protocol of ['legacy', 'sftp']) {
  test(`real ${protocol}: copies a binary file with spaces in both paths`, {
    skip: !scpBin || !sftpServer ? 'set CLOVER_TEST_SCP_BIN and CLOVER_TEST_SFTP_SERVER to run real OpenSSH checks' : false,
  }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'clover-scp-'))
    try {
      const sourceDir = join(root, 'My Trainer')
      const targetDir = join(root, 'My Outputs')
      await mkdir(sourceDir)
      await mkdir(targetDir)
      const source = join(sourceDir, 'output file.bin')
      const target = join(targetDir, 'result file.bin')
      const contents = Buffer.from([0, 1, 2, 255, 10, 13, 42])
      await writeFile(source, contents)
      // Behave like ssh's remote command execution, using a local POSIX shell.
      const localSsh = join(root, 'local-ssh.sh')
      await writeFile(localSsh, '#!/bin/sh\nfor arg do command=$arg; done\nexec /bin/sh -c "$command"\n', { mode: 0o700 })
      const flags = protocol === 'legacy' ? ['-O', '-S', remotePath(localSsh)] : ['-D', sftpServer]
      const service = loadSource('../apps/desktop/src/main/services/ssh.ts', {
        '../lib/run': { ...run, run: (_command, args, options) => run.run(scpBin, [...flags, ...args], options) },
      })
      const result = await service.scpFrom({ kind: 'ssh', host: 'fixture', user: 'user' }, remotePath(source), target, 10000)
      assert.equal(result.code, 0, result.stderr || result.stdout)
      assert.deepEqual(await readFile(target), contents)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
}
