import { app, dialog, nativeTheme, protocol } from 'electron'
import { chmodSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ensureDirs } from './lib/paths'
import { ensureMirror, listBranches, listCommits } from './services/git'
import { createInstance, listInstances } from './services/instances'
import { installDeps } from './services/runtimes'
import { cancelJob, getJob, getJobLogs, onJobCompleted, startJob, startTrainingJob } from './services/supervisor'
import { createTrainerVersion, listTrainerVersions, startTrainerRun } from './services/trainers'
import { listLaunchRows, removeLaunchRow, upsertLaunchRow } from './services/launchQueue'
import { listTrainerBranches, listTrainerCommits } from './services/trainerGit'
import { listTrainingHosts, removeTrainingHost, saveTrainingHost, testTrainingHost, updateTrainingHostVersions } from './services/trainingHosts'
import {
  remoteBranches,
  remoteCommits,
  remoteCreateVersion,
  remoteDoctor,
  remoteInstallRuntime,
  remoteRemoveVersion,
  remoteVersions,
} from './services/remoteTrainer'
import { run } from './lib/run'
import { matchRule, parseTqdm } from './services/parsers'
import { registerIpc } from './ipc'
import { scanEnvironment } from './services/env'
import { getSettings } from './services/settings'
import { collectTrainerArtifact } from './services/trainerArtifacts'
import { checkUpdates } from './services/updates'
import { downloadCustomModel, getCatalog, listDownloads } from './services/models'
import { registerGalleryProtocol } from './services/gallery'
import { createAppWindow, getWindow, openWindow } from './windows'

const isDev = !app.isPackaged
const smoke = process.argv.includes('--smoke')
const screenshot = process.argv.includes('--screenshot')
const scenario = process.argv.find((arg) => arg.startsWith('--scenario='))?.split('=')[1]

if (isDev) {
  // Keep dev data inside the checkout: easier to inspect, reset and sandbox-friendly.
  app.setPath('userData', join(app.getAppPath(), '..', '..', '.dev-data'))
}
app.setName('CloverMoss')
nativeTheme.themeSource = 'dark'

protocol.registerSchemesAsPrivileged([
  { scheme: 'clover', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
])

const noSandbox = process.env['CLOVER_NO_SANDBOX'] === '1' || smoke || screenshot || Boolean(scenario)
if (noSandbox) {
  // The harness/CI sandbox cannot initialize Chromium's zygote sandbox. End-user builds keep it on.
  app.commandLine.appendSwitch('no-sandbox')
}
if (smoke || screenshot) {
  // Headless captures do not need GPU; keeping it off also avoids Chromium GPU-process noise.
  app.disableHardwareAcceleration()
}

async function runSmoke(): Promise<void> {
  const settings = getSettings()
  const started = Date.now()
  const [env, updates, catalog] = await Promise.all([
    scanEnvironment(settings),
    checkUpdates(settings),
    getCatalog(settings),
  ])
  console.log(
    JSON.stringify(
      {
        smoke: true,
        elapsedMs: Date.now() - started,
        platform: process.platform,
        arch: process.arch,
        gpu: env.gpu,
        pythons: env.pythons.map((python) => `${python.version} (${python.source})`),
        checks: env.checks.map((check) => `${check.id}:${check.status}`),
        recommendation: env.recommendation,
        network: env.network.selected,
        updates: {
          source: updates.manifestSource,
          current: updates.currentVersion,
          latest: updates.latestVersion,
          announcements: updates.announcements.length,
          error: updates.error,
        },
        catalog: {
          source: catalog.source,
          models: catalog.models.length,
          adapters: catalog.adapters.length,
        },
      },
      null,
      2,
    ),
  )
  app.exit(0)
}

app.whenReady().then(async () => {
  ensureDirs(getSettings().modelsRoot)
  onJobCompleted((job) => {
    if (job.kind === 'training' && job.state === 'succeeded') void collectTrainerArtifact(job)
  })
  registerGalleryProtocol()
  registerIpc()

  if (smoke) {
    await runSmoke().catch((error) => {
      console.error(error)
      app.exit(1)
    })
    return
  }

  if (scenario === 'create') {
    const settings = getSettings()
    try {
      await ensureMirror(settings)
      const branches = await listBranches()
      const commits = await listCommits(branches[0]?.name ?? 'main', 5)
      if (!commits[0]) throw new Error('没有提交')
      const instance = await createInstance(
        { branch: branches[0]?.name ?? 'main', commit: commits[0].sha, runtimeMode: 'shared' },
        settings,
      )
      console.log(JSON.stringify({ scenario: 'create', branches, instance }, null, 2))
      app.exit(0)
    } catch (error) {
      console.error(error)
      app.exit(1)
    }
    return
  }

  if (scenario === 'install') {
    const settings = getSettings()
    try {
      const [instance] = await listInstances()
      if (!instance) throw new Error('没有实例，先运行 --scenario=create')
      const runtime = await installDeps(instance.runtimeId, settings, (line) => console.log(line))
      console.log(JSON.stringify({ scenario: 'install', runtime }, null, 2))
      app.exit(0)
    } catch (error) {
      console.error(error)
      app.exit(1)
    }
    return
  }

  if (scenario === 'second') {
    const settings = getSettings()
    try {
      await ensureMirror(settings)
      const commits = await listCommits('main', 6)
      const first = (await listInstances())[0]
      const older = commits.find((commit) => commit.sha !== first?.commit) ?? commits[1]
      if (!older) throw new Error('提交不足')
      const instance = await createInstance(
        { branch: 'main', commit: older.sha, runtimeMode: 'shared' },
        settings,
      )
      console.log(
        JSON.stringify(
          {
            scenario: 'second',
            existingRuntime: first?.runtimeId,
            newRuntime: instance.runtimeId,
            shared: first?.runtimeId === instance.runtimeId,
            instance,
          },
          null,
          2,
        ),
      )
      app.exit(0)
    } catch (error) {
      console.error(error)
      app.exit(1)
    }
    return
  }

  if (scenario === 'job') {
    try {
      const [instance] = await listInstances()
      if (!instance) throw new Error('没有实例，先运行 --scenario=create')
      const job = await startJob({
        instanceId: instance.id,
        prompt: 'A quiet blue morning, simulated job for CloverMoss M4',
        negativePrompt: '',
        width: 512,
        height: 512,
        steps: 4,
        cfg: 1,
        seed: 42,
        profile: 'dmd8',
        mode: 'simulate',
      })
      const deadline = Date.now() + 60_000
      let current = job
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 400))
        current = (await getJob(job.id)) ?? current
        if (current.state === 'succeeded' || current.state === 'failed' || current.state === 'canceled') break
      }
      const logs = await getJobLogs(job.id)
      console.log(
        JSON.stringify(
          {
            scenario: 'job',
            state: current.state,
            stage: current.stage,
            progress: current.progress,
            outputs: current.outputs,
            error: current.error,
            logLines: logs.length,
          },
          null,
          2,
        ),
      )
      app.exit(current.state === 'succeeded' ? 0 : 1)
    } catch (error) {
      console.error(error)
      app.exit(1)
    }
    return
  }

  if (scenario === 'parser') {
    console.log(
      JSON.stringify(
        {
          tqdm: parseTqdm(' 45%|████▌     | 9/20 [00:12<00:15,  1.37s/it]'),
          oom: matchRule('CUDA out of memory. Tried to allocate 2.00 GiB')?.id ?? null,
          module: matchRule("ModuleNotFoundError: No module named 'xformers'")?.id ?? null,
        },
        null,
        2,
      ),
    )
    app.exit(0)
    return
  }

  if (scenario === 'job-cancel') {
    try {
      const [instance] = await listInstances()
      if (!instance) throw new Error('没有实例')
      const job = await startJob({
        instanceId: instance.id,
        prompt: 'cancel test',
        width: 512,
        height: 512,
        steps: 20,
        cfg: 1,
        seed: 1,
        profile: 'dmd8',
        mode: 'simulate',
      })
      await new Promise((resolve) => setTimeout(resolve, 700))
      await cancelJob(job.id)
      const deadline = Date.now() + 20_000
      let current = job
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 200))
        current = (await getJob(job.id)) ?? current
        if (current.state !== 'running' && current.state !== 'starting') break
      }
      console.log(JSON.stringify({ scenario: 'job-cancel', state: current.state, error: current.error }, null, 2))
      app.exit(0)
    } catch (error) {
      console.error(error)
      app.exit(1)
    }
    return
  }

  if (scenario === 'job-real') {
    try {
      const [instance] = await listInstances()
      if (!instance) throw new Error('没有实例')
      await startJob({
        instanceId: instance.id,
        prompt: 'A model-missing preflight check',
        width: 512,
        height: 512,
        steps: 8,
        cfg: 1,
        seed: 1,
        profile: 'dmd8',
        mode: 'runner',
      })
      console.log(JSON.stringify({ scenario: 'job-real', unexpected: true }))
      app.exit(1)
    } catch (error) {
      console.log(
        JSON.stringify(
          { scenario: 'job-real', expected: true, message: error instanceof Error ? error.message : String(error) },
          null,
          2,
        ),
      )
      app.exit(0)
    }
    return
  }

  if (scenario === 'download-test') {
    try {
      const task = await downloadCustomModel('hf-internal-testing/tiny-random-gpt2', getSettings())
      const deadline = Date.now() + 180_000
      let current = task
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        current = listDownloads().find((item) => item.id === task.id) ?? current
        if (current.state === 'done' || current.state === 'error') break
      }
      console.log(JSON.stringify(current, null, 2))
      app.exit(current.state === 'done' ? 0 : 1)
    } catch (error) {
      console.error(error)
      app.exit(1)
    }
    return
  }

  if (scenario === 'trainer-remote-env') {
    try {
      const root = join(app.getPath('userData'), 'remote-trainer-env')
      rmSync(root, { recursive: true, force: true })
      mkdirSync(join(root, 'git'), { recursive: true })
      const fakeBin = join(app.getPath('userData'), 'fake-bin-env')
      mkdirSync(fakeBin, { recursive: true })
      const uv = join(fakeBin, 'uv')
      writeFileSync(uv, `#!/bin/bash
if [ "$1" = "venv" ]; then
  R="$2"; mkdir -p "$R/bin"
  printf '#!/bin/bash\necho Python 3.12\n' > "$R/bin/python"
  printf '#!/bin/bash\nexit 0\n' > "$R/bin/kohakumoss-config"
  printf '#!/bin/bash\nexit 0\n' > "$R/bin/kogine"
  printf '#!/bin/bash\necho doctor-ok\n' > "$R/bin/kohakumoss-doctor"
  chmod +x "$R/bin/"*
  exit 0
fi
exit 0
`, 'utf8')
      chmodSync(uv, 0o755)
      const localMirror = join(app.getPath('userData'), 'trainer', 'git', 'kohaku-trainer.git')
      cpSync(localMirror, join(root, 'git', 'kohaku-trainer.git'), { recursive: true })
      await run('git', ['-C', join(root, 'git', 'kohaku-trainer.git'), 'remote', 'set-url', 'origin', localMirror])
      const fake = join(app.getPath('userData'), 'fake-ssh-env.sh')
      writeFileSync(fake, `#!/bin/bash\nexport PATH="${fakeBin}:$PATH"\nfor last; do :; done\nlast="$(printf '%s' "$last" | sed 's/^bash -lc /bash -c /')"\nexec bash -c "$last"\n`, 'utf8')
      chmodSync(fake, 0o755)
      process.env['CLOVER_SSH_BIN'] = fake
      const host = saveTrainingHost({ name: 'Fake Env', host: 'fake.local', user: 'tester', port: 22, trainerRoot: root })
      const branches = await remoteBranches(getSettings(), host.id)
      const branch = branches.find((item) => item.isDefault)?.name ?? 'main'
      const commits = await remoteCommits(getSettings(), host.id, branch, 3)
      if (!commits[0]) throw new Error('no commit')
      const version = await remoteCreateVersion(getSettings(), host.id, { branch, commit: commits[0].sha })
      const runtime = await remoteInstallRuntime(getSettings(), version)
      const checked = await remoteDoctor(getSettings(), { ...version, runtimeId: runtime.id, runtimeState: 'ready' })
      console.log(JSON.stringify({ scenario: 'trainer-remote-env', runtime: runtime.state, doctor: checked.ok, output: checked.output }, null, 2))
      await remoteRemoveVersion(getSettings(), version)
      removeTrainingHost(host.id)
      app.exit(runtime.state === 'ready' && checked.ok ? 0 : 1)
    } catch (error) {
      console.error(error)
      app.exit(1)
    }
    return
  }

  if (scenario === 'queue-persist') {
    const row = {
      id: `queue-test-${Date.now()}`,
      caseName: 'Queue Test',
      instanceId: 'moss-main-9d799c1',
      instanceName: 'moss-main-9d799c1',
      backend: 'official' as const,
      deviceId: 'mps',
      profile: 'base' as const,
      state: 'queued' as const,
      queuedAt: new Date().toISOString(),
    }
    upsertLaunchRow(row)
    const saved = listLaunchRows().find((item) => item.id === row.id)
    removeLaunchRow(row.id)
    console.log(JSON.stringify({ scenario: 'queue-persist', saved: Boolean(saved), state: saved?.state, remaining: listLaunchRows().filter((item) => item.id === row.id).length }, null, 2))
    app.exit(saved ? 0 : 1)
    return
  }

  if (scenario === 'trainer-remote-artifact') {
    try {
      const root = join(app.getPath('userData'), 'remote-trainer-artifact')
      rmSync(root, { recursive: true, force: true })
      mkdirSync(join(root, 'git'), { recursive: true })
      const fakeBin = join(app.getPath('userData'), 'fake-bin')
      mkdirSync(fakeBin, { recursive: true })
      writeFileSync(join(fakeBin, 'nvidia-smi'), '#!/bin/bash\necho "Fake GPU, 24576 MiB"\n', 'utf8')
      chmodSync(join(fakeBin, 'nvidia-smi'), 0o755)
      const localMirror = join(app.getPath('userData'), 'trainer', 'git', 'kohaku-trainer.git')
      cpSync(localMirror, join(root, 'git', 'kohaku-trainer.git'), { recursive: true })
      await run('git', ['-C', join(root, 'git', 'kohaku-trainer.git'), 'remote', 'set-url', 'origin', localMirror])
      const fakeSsh = join(app.getPath('userData'), 'fake-ssh-artifact.sh')
      writeFileSync(fakeSsh, `#!/bin/bash\nexport PATH="${fakeBin}:$PATH"\nfor last; do :; done\nexec bash -lc "$last"\n`, 'utf8')
      chmodSync(fakeSsh, 0o755)
      const fakeScp = join(app.getPath('userData'), 'fake-scp-artifact.sh')
      writeFileSync(fakeScp, '#!/bin/bash\nfor last; do :; done\nsrc="${@: -2:1}"\ndst="$last"\nsrc="${src#*:}"\ncp "$src" "$dst"\n', 'utf8')
      chmodSync(fakeScp, 0o755)
      process.env['CLOVER_SSH_BIN'] = fakeSsh
      process.env['CLOVER_SCP_BIN'] = fakeScp
      const host = saveTrainingHost({ name: 'Fake GPU', host: 'fake.local', user: 'tester', port: 22, trainerRoot: root })
      const branches = await remoteBranches(getSettings(), host.id)
      const branch = branches.find((item) => item.isDefault)?.name ?? 'main'
      const commits = await remoteCommits(getSettings(), host.id, branch, 3)
      if (!commits[0]) throw new Error('no commit')
      const version = await remoteCreateVersion(getSettings(), host.id, { branch, commit: commits[0].sha })
      const bin = join(root, 'runtimes', 'fake-runtime', 'bin')
      mkdirSync(bin, { recursive: true })
      writeFileSync(join(bin, 'kogine'), '#!/bin/bash\necho "step 5 loss=0.1"\n', 'utf8')
      chmodSync(join(bin, 'kogine'), 0o755)
      writeFileSync(join(bin, 'kohakumoss-config'), '#!/bin/bash\nexit 0\n', 'utf8')
      chmodSync(join(bin, 'kohakumoss-config'), 0o755)
      const withRuntime = { ...version, runtimeId: 'fake-runtime', runtimeState: 'ready' as const }
      updateTrainingHostVersions(getSettings(), host.id, [withRuntime])
      mkdirSync(join(version.path, 'exports'), { recursive: true })
      writeFileSync(join(version.path, 'exports', 'artifact-test.safetensors'), 'fake-adapter', 'utf8')
      mkdirSync(join(version.path, 'runs', 'moss', 'artifact-test', 'checkpoints', 'step_00000005'), { recursive: true })
      writeFileSync(join(version.path, 'runs', 'moss', 'artifact-test', 'checkpoints', 'step_00000005', 'trainable.safetensors'), 'fake', 'utf8')
      const job = await startTrainerRun(getSettings(), {
        versionId: version.id, action: 'export', runName: 'artifact-test',
        weights: '/remote/weights', dataset: '/remote/data', algo: 'lora', steps: 5,
        lr: '1e-4', dim: '32', alpha: '32', batch: '1', resolution: 1024, overrides: '',
      })
      let current = job
      const deadline = Date.now() + 20_000
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 200))
        current = (await getJob(job.id)) ?? current
        if (current.state !== 'running' && current.state !== 'starting') break
      }
      await new Promise((resolve) => setTimeout(resolve, 2000))
      const catalog = await getCatalog(getSettings(), true)
      const registered = catalog.adapters.find((item) => item.id === 'trained-artifact-test')
      console.log(JSON.stringify({ scenario: 'trainer-remote-artifact', state: current.state, error: current.error, logs: (await getJobLogs(job.id)).slice(-12), registered: Boolean(registered), provider: registered?.provider, installed: registered?.installed }, null, 2))
      await remoteRemoveVersion(getSettings(), withRuntime)
      removeTrainingHost(host.id)
      const adapterDir = join(getSettings().modelsRoot ?? join(app.getPath('userData'), 'models'), 'adapters')
      rmSync(join(adapterDir, 'trained-artifact-test'), { recursive: true, force: true })
      try {
        const index = JSON.parse(readFileSync(join(adapterDir, 'index.json'), 'utf8')) as { adapters: Array<{ id: string }> }
        index.adapters = index.adapters.filter((item) => item.id !== 'trained-artifact-test')
        writeFileSync(join(adapterDir, 'index.json'), JSON.stringify(index, null, 2), 'utf8')
      } catch {
        // no local index
      }
      app.exit(current.state === 'succeeded' && registered ? 0 : 1)
    } catch (error) {
      console.error(error)
      app.exit(1)
    }
    return
  }

  if (scenario === 'trainer-remote-job') {
    try {
      const root = join(app.getPath('userData'), 'remote-trainer-job')
      rmSync(root, { recursive: true, force: true })
      mkdirSync(join(root, 'git'), { recursive: true })
      const fakeBin = join(app.getPath('userData'), 'fake-bin')
      mkdirSync(fakeBin, { recursive: true })
      const nvidia = join(fakeBin, 'nvidia-smi')
      writeFileSync(nvidia, '#!/bin/bash\necho "Fake GPU, 24576 MiB"\n', 'utf8')
      chmodSync(nvidia, 0o755)
      const localMirror = join(app.getPath('userData'), 'trainer', 'git', 'kohaku-trainer.git')
      const remoteMirror = join(root, 'git', 'kohaku-trainer.git')
      cpSync(localMirror, remoteMirror, { recursive: true })
      await run('git', ['-C', remoteMirror, 'remote', 'set-url', 'origin', localMirror])
      const fake = join(app.getPath('userData'), 'fake-ssh-job.sh')
      writeFileSync(fake, `#!/bin/bash\nexport PATH="${fakeBin}:$PATH"\nfor last; do :; done\nlast="$(printf '%s' "$last" | sed 's/^bash -lc /bash -c /')"\nexec bash -c "$last"\n`, 'utf8')
      chmodSync(fake, 0o755)
      process.env['CLOVER_SSH_BIN'] = fake
      const host = saveTrainingHost({
        name: 'Fake GPU',
        host: 'fake.local',
        user: 'tester',
        port: 22,
        trainerRoot: root,
      })
      const branches = await remoteBranches(getSettings(), host.id)
      const branch = branches.find((item) => item.isDefault)?.name ?? 'main'
      const commits = await remoteCommits(getSettings(), host.id, branch, 3)
      if (!commits[0]) throw new Error('远端没有提交')
      const version = await remoteCreateVersion(getSettings(), host.id, { branch, commit: commits[0].sha })
      const bin = join(root, 'runtimes', 'fake-runtime', 'bin')
      mkdirSync(bin, { recursive: true })
      const config = join(bin, 'kohakumoss-config')
      writeFileSync(config, '#!/bin/bash\nexit 0\n', 'utf8')
      chmodSync(config, 0o755)
      const kogine = join(bin, 'kogine')
      writeFileSync(kogine, '#!/bin/bash\nfor i in 1 2 3 4 5; do echo "step $i loss=0.$((6-i)) lr=1e-4"; sleep 0.1; done\n', 'utf8')
      chmodSync(kogine, 0o755)
      const withRuntime = { ...version, runtimeId: 'fake-runtime', runtimeState: 'ready' as const }
      updateTrainingHostVersions(getSettings(), host.id, [withRuntime])
      const job = await startTrainerRun(getSettings(), {
        versionId: version.id,
        action: 'train',
        runName: 'remote-test',
        weights: '/remote/weights',
        dataset: '/remote/data',
        algo: 'lora',
        steps: 5,
        lr: '1e-4',
        dim: '32',
        alpha: '32',
        batch: '1',
        resolution: 1024,
        overrides: '',
      })
      const deadline = Date.now() + 20_000
      let current = job
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 200))
        current = (await getJob(job.id)) ?? current
        if (current.state !== 'running' && current.state !== 'starting') break
      }
      console.log(JSON.stringify({ scenario: 'trainer-remote-job', state: current.state, hostId: current.hostId, metrics: current.metrics, progress: current.progress }, null, 2))
      await remoteRemoveVersion(getSettings(), withRuntime)
      removeTrainingHost(host.id)
      app.exit(current.state === 'succeeded' ? 0 : 1)
    } catch (error) {
      console.error(error)
      app.exit(1)
    }
    return
  }

  if (scenario === 'trainer-remote-local') {
    try {
      const root = join(app.getPath('userData'), 'remote-trainer-test')
      rmSync(root, { recursive: true, force: true })
      mkdirSync(join(root, 'git'), { recursive: true })
      const localMirror = join(app.getPath('userData'), 'trainer', 'git', 'kohaku-trainer.git')
      const remoteMirror = join(root, 'git', 'kohaku-trainer.git')
      cpSync(localMirror, remoteMirror, { recursive: true })
      await run('git', ['-C', remoteMirror, 'remote', 'set-url', 'origin', localMirror])
      const fake = join(app.getPath('userData'), 'fake-ssh.sh')
      writeFileSync(fake, '#!/bin/bash\nfor last; do :; done\nexec bash -lc "$last"\n', 'utf8')
      chmodSync(fake, 0o755)
      process.env['CLOVER_SSH_BIN'] = fake
      const host = saveTrainingHost({
        name: 'Fake Linux',
        host: 'fake.local',
        user: 'tester',
        port: 22,
        trainerRoot: root,
      })
      const branches = await remoteBranches(getSettings(), host.id)
      const branch = branches.find((item) => item.isDefault)?.name ?? branches[0]?.name ?? 'main'
      const commits = await remoteCommits(getSettings(), host.id, branch, 3)
      if (!commits[0]) throw new Error('远端没有提交')
      const version = await remoteCreateVersion(getSettings(), host.id, { branch, commit: commits[0].sha })
      const versions = remoteVersions(getSettings(), host.id)
      await remoteRemoveVersion(getSettings(), version)
      removeTrainingHost(host.id)
      console.log(JSON.stringify({ scenario: 'trainer-remote-local', branches: branches.length, commits: commits.length, version: version.id, versions: versions.length }, null, 2))
      app.exit(0)
    } catch (error) {
      console.error(error)
      app.exit(1)
    }
    return
  }

  if (scenario === 'trainer-host-probe') {
    try {
      const fake = join(app.getPath('userData'), 'fake-ssh.sh')
      writeFileSync(fake, '#!/bin/bash\nfor last; do :; done\nexec bash -lc "$last"\n', 'utf8')
      chmodSync(fake, 0o755)
      process.env['CLOVER_SSH_BIN'] = fake
      const host = saveTrainingHost({
        name: 'Fake Linux',
        host: 'fake.local',
        user: 'tester',
        port: 22,
        trainerRoot: join(app.getPath('userData'), 'trainer'),
      })
      const checked = await testTrainingHost(getSettings(), host.id)
      console.log(JSON.stringify({ scenario: 'trainer-host-probe', status: checked.status, remote: checked.remote, error: checked.error }, null, 2))
      removeTrainingHost(host.id)
      app.exit(checked.status === 'ok' ? 0 : 1)
    } catch (error) {
      console.error(error)
      app.exit(1)
    }
    return
  }

  if (scenario === 'trainer-host') {
    const host = saveTrainingHost({
      name: 'Test 4090',
      host: '192.0.2.10',
      user: 'trainer',
      port: 22,
      trainerRoot: '~/CloverMossTrainer',
    })
    const before = listTrainingHosts(getSettings())
    removeTrainingHost(host.id)
    const after = listTrainingHosts(getSettings())
    console.log(JSON.stringify({ scenario: 'trainer-host', saved: host, before: before.length, after: after.length }, null, 2))
    app.exit(0)
    return
  }

  if (scenario === 'trainer-job') {
    try {
      const version = (await listTrainerVersions(getSettings()))[0]
      const job = await startTrainingJob({
        versionId: version?.id ?? 'sim-trainer',
        name: 'Kohaku 训练（模拟）',
        cwd: process.cwd(),
        command: process.platform === 'win32' ? 'python' : 'python3',
        args: [
          '-u',
          '-c',
          'import time\nfor i in range(1,6):\n print(f"step {i} loss={0.5/i:.4f} lr=1e-4", flush=True)\n time.sleep(0.15)',
        ],
        totalSteps: 5,
      })
      const deadline = Date.now() + 20_000
      let current = job
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 200))
        current = (await getJob(job.id)) ?? current
        if (current.state !== 'running' && current.state !== 'starting') break
      }
      console.log(JSON.stringify({ scenario: 'trainer-job', state: current.state, metrics: current.metrics, progress: current.progress, logLines: (await getJobLogs(job.id)).length }, null, 2))
      app.exit(current.state === 'succeeded' ? 0 : 1)
    } catch (error) {
      console.error(error)
      app.exit(1)
    }
    return
  }

  if (scenario === 'trainer-deploy') {
    try {
      const settings = getSettings()
      const branches = await listTrainerBranches(settings)
      const branch = branches.find((item) => item.isDefault)?.name ?? branches[0]?.name ?? 'main'
      const commits = await listTrainerCommits(settings, branch, 3)
      if (!commits[0]) throw new Error('训练器没有提交')
      const version = await createTrainerVersion(settings, { branch, commit: commits[0].sha })
      const versions = await listTrainerVersions(settings)
      console.log(JSON.stringify({ scenario: 'trainer-deploy', branch, commits: commits.length, version, versions: versions.length }, null, 2))
      app.exit(0)
    } catch (error) {
      console.error(error)
      app.exit(1)
    }
    return
  }

  if (scenario === 'windows') {
    const launcher = createAppWindow('launcher', false)
    await new Promise<void>((resolve) => launcher.webContents.once('did-finish-load', () => resolve()))
    await new Promise((resolve) => setTimeout(resolve, 1200))
    await launcher.webContents.executeJavaScript("window.clover.invoke('window:open', { kind: 'creator' })")
    await new Promise((resolve) => setTimeout(resolve, 1500))
    const creator = Boolean(getWindow('creator'))
    await launcher.webContents.executeJavaScript("window.clover.invoke('window:open', { kind: 'terminal' })")
    await new Promise((resolve) => setTimeout(resolve, 1500))
    const terminal = Boolean(getWindow('terminal'))
    console.log(JSON.stringify({ scenario: 'windows', creator, terminal }, null, 2))
    app.exit(creator && terminal ? 0 : 1)
    return
  }

  if (screenshot) {
    const launcher = createAppWindow('launcher', false)
    await new Promise<void>((resolve) => launcher.webContents.once('did-finish-load', () => resolve()))
    await new Promise((resolve) => setTimeout(resolve, 4500))
    const oobe = await launcher.webContents.capturePage()
    writeFileSync(join(app.getPath('userData'), 'screenshot-oobe.png'), oobe.toPNG())
    await launcher.webContents.executeJavaScript(
      "[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '本次跳过')?.click()",
    )
    await new Promise((resolve) => setTimeout(resolve, 700))
    const home = await launcher.webContents.capturePage()
    writeFileSync(join(app.getPath('userData'), 'screenshot-home.png'), home.toPNG())
    await launcher.webContents.executeJavaScript(
      "[...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '隐藏通知')?.click()",
    )
    await new Promise((resolve) => setTimeout(resolve, 500))
    const cleanHome = await launcher.webContents.capturePage()
    writeFileSync(join(app.getPath('userData'), 'screenshot-home-clean.png'), cleanHome.toPNG())
    await launcher.webContents.executeJavaScript(
      "[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '启动')?.click()",
    )
    await new Promise((resolve) => setTimeout(resolve, 1600))
    const launch = await launcher.webContents.capturePage()
    writeFileSync(join(app.getPath('userData'), 'screenshot-launch.png'), launch.toPNG())

    const routes: Array<[string, string]> = [
      ['/instances', 'instances'],
      ['/instances/moss-main-9d799c1', 'instance-detail'],
      ['/diagnostics', 'diagnostics'],
      ['/gallery', 'gallery-launcher'],
      ['/training', 'training'],
      ['/models', 'models'],
      ['/settings', 'settings'],
    ]
    for (const [route, name] of routes) {
      await launcher.webContents.executeJavaScript(`location.hash = '#${route}'`)
      await new Promise((resolve) => setTimeout(resolve, route === '/training' ? 2800 : 900))
      const image = await launcher.webContents.capturePage()
      writeFileSync(join(app.getPath('userData'), `screenshot-${name}.png`), image.toPNG())
    }

    const creator = createAppWindow('creator', false)
    await new Promise<void>((resolve) => creator.webContents.once('did-finish-load', () => resolve()))
    await new Promise((resolve) => setTimeout(resolve, 2200))
    const studio = await creator.webContents.capturePage()
    writeFileSync(join(app.getPath('userData'), 'screenshot-studio.png'), studio.toPNG())
    await creator.webContents.executeJavaScript("location.hash = '#/gallery'")
    await new Promise((resolve) => setTimeout(resolve, 1000))
    const gallery = await creator.webContents.capturePage()
    writeFileSync(join(app.getPath('userData'), 'screenshot-gallery.png'), gallery.toPNG())

    const terminal = createAppWindow('terminal', false)
    await new Promise<void>((resolve) => terminal.webContents.once('did-finish-load', () => resolve()))
    await new Promise((resolve) => setTimeout(resolve, 5000))
    const terminalShot = await terminal.webContents.capturePage()
    writeFileSync(join(app.getPath('userData'), 'screenshot-terminal.png'), terminalShot.toPNG())

    const trainer = createAppWindow('trainer', false)
    await new Promise<void>((resolve) => trainer.webContents.once('did-finish-load', () => resolve()))
    await new Promise((resolve) => setTimeout(resolve, 3000))
    const trainerShot = await trainer.webContents.capturePage()
    writeFileSync(join(app.getPath('userData'), 'screenshot-trainer.png'), trainerShot.toPNG())

    console.log('screenshots written to', app.getPath('userData'))
    app.exit(0)
    return
  }

  createAppWindow('launcher')
  app.on('activate', () => {
    openWindow('launcher')
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
