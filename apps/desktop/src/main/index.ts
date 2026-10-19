import { app, dialog, nativeTheme, protocol } from 'electron'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ensureDirs } from './lib/paths'
import { ensureMirror, listBranches, listCommits } from './services/git'
import { createInstance, listInstances } from './services/instances'
import { installDeps } from './services/runtimes'
import { cancelJob, getJob, getJobLogs, startJob, startTrainingJob } from './services/supervisor'
import { createTrainerVersion, listTrainerVersions } from './services/trainers'
import { listTrainerBranches, listTrainerCommits } from './services/trainerGit'
import { matchRule, parseTqdm } from './services/parsers'
import { registerIpc } from './ipc'
import { scanEnvironment } from './services/env'
import { getSettings } from './services/settings'
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
