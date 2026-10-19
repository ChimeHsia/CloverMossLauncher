import { app, BrowserWindow, dialog, protocol, shell } from 'electron'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ensureDirs } from './lib/paths'
import { ensureMirror, listBranches, listCommits } from './services/git'
import { createInstance, listInstances } from './services/instances'
import { installDeps } from './services/runtimes'
import { cancelJob, getJob, getJobLogs, startJob } from './services/supervisor'
import { matchRule, parseTqdm } from './services/parsers'
import { registerIpc } from './ipc'
import { scanEnvironment } from './services/env'
import { getSettings } from './services/settings'
import { checkUpdates } from './services/updates'
import { downloadCustomModel, getCatalog, listDownloads } from './services/models'
import { registerGalleryProtocol } from './services/gallery'

const isDev = !app.isPackaged
const smoke = process.argv.includes('--smoke')
const screenshot = process.argv.includes('--screenshot')
const scenario = process.argv.find((arg) => arg.startsWith('--scenario='))?.split('=')[1]

if (isDev) {
  // Keep dev data inside the checkout: easier to inspect, reset and sandbox-friendly.
  app.setPath('userData', join(app.getAppPath(), '..', '..', '.dev-data'))
}
app.setName('CloverMoss')

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

function createWindow(show = true): BrowserWindow {
  const acrylic = !screenshot && (process.platform === 'darwin' || process.platform === 'win32')
  const win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'CloverMoss',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 18 },
    ...(process.platform === 'darwin'
      ? { vibrancy: 'under-window' as const, visualEffectState: 'active' as const }
      : {}),
    ...(process.platform === 'win32' ? { backgroundMaterial: 'acrylic' as const } : {}),
    backgroundColor: acrylic ? '#00000000' : '#0b1220',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      additionalArguments: [acrylic ? '--clover-acrylic' : '--clover-opaque'],
    },
  })

  win.once('ready-to-show', () => {
    if (show) win.show()
  })

  win.webContents.on('console-message', (...args: unknown[]) => {
    const details = args[1] as { level?: string; message?: string } | number | undefined
    if (details && typeof details === 'object' && details.message) {
      console.log(`[renderer:${details.level ?? 'log'}]`, details.message)
    } else if (typeof args[2] === 'string') {
      console.log('[renderer]', args[2])
    }
  })
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[renderer:gone]', details.reason, details.exitCode)
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    const current = win.webContents.getURL()
    if (url !== current) {
      event.preventDefault()
      if (url.startsWith('https://')) void shell.openExternal(url)
    }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
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

  if (screenshot) {
    const win = createWindow(false)
    await new Promise<void>((resolve) => win.webContents.once('did-finish-load', () => resolve()))
    await new Promise((resolve) => setTimeout(resolve, 8000))
    const routes: Array<[string, string]> = [
      ['/', 'home'],
      ['/instances', 'instances'],
      ['/instances/moss-main-9d799c1', 'instance-detail'],
      ['/studio', 'studio'],
      ['/gallery', 'gallery'],
      ['/run', 'run'],
      ['/diagnostics', 'diagnostics'],
      ['/models', 'models'],
      ['/settings', 'settings'],
    ]
    for (const [route, name] of routes) {
      await win.webContents.executeJavaScript(`location.hash = '#${route}'`)
      await new Promise((resolve) => setTimeout(resolve, 1200))
      const image = await win.webContents.capturePage()
      writeFileSync(join(app.getPath('userData'), `screenshot-${name}.png`), image.toPNG())
    }
    await win.webContents.executeJavaScript("location.hash = '#/'; document.querySelector('main')?.scrollTo(0, 620)")
    await new Promise((resolve) => setTimeout(resolve, 1000))
    const scrolled = await win.webContents.capturePage()
    writeFileSync(join(app.getPath('userData'), 'screenshot-home-scrolled.png'), scrolled.toPNG())
    await win.webContents.executeJavaScript("location.hash = '#/gallery'")
    await new Promise((resolve) => setTimeout(resolve, 900))
    await win.webContents.executeJavaScript(
      "[...document.querySelectorAll('main button')].find((b) => b.querySelector('img'))?.click()",
    )
    await new Promise((resolve) => setTimeout(resolve, 1400))
    const galleryDetail = await win.webContents.capturePage()
    writeFileSync(join(app.getPath('userData'), 'screenshot-gallery-detail.png'), galleryDetail.toPNG())
    const handoff = await win.webContents.executeJavaScript(
      "(()=>{const b=[...document.querySelectorAll('button')].find((x)=>x.textContent.includes('用作布局底图')); if(b){b.click(); return true} return false})()",
    )
    if (handoff) {
      await new Promise((resolve) => setTimeout(resolve, 1200))
      const studioBackground = await win.webContents.capturePage()
      writeFileSync(join(app.getPath('userData'), 'screenshot-studio-background.png'), studioBackground.toPNG())
    } else {
      await win.webContents.executeJavaScript(
        "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))",
      )
    }

    await win.webContents.executeJavaScript(
      "location.hash = '#/'; document.querySelector('main')?.scrollTo(0, 0)",
    )
    await new Promise((resolve) => setTimeout(resolve, 700))
    await win.webContents.executeJavaScript(
      "[...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label')?.includes('隐藏通知'))?.click()",
    )
    await new Promise((resolve) => setTimeout(resolve, 500))
    const cleanHome = await win.webContents.capturePage()
    writeFileSync(join(app.getPath('userData'), 'screenshot-home-clean.png'), cleanHome.toPNG())

    await win.webContents.executeJavaScript(
      "[...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '收起侧栏')?.click()",
    )
    await new Promise((resolve) => setTimeout(resolve, 450))
    const collapsed = await win.webContents.capturePage()
    writeFileSync(join(app.getPath('userData'), 'screenshot-sidebar-collapsed.png'), collapsed.toPNG())
    await win.webContents.executeJavaScript(
      "[...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '展开侧栏')?.click()",
    )
    await new Promise((resolve) => setTimeout(resolve, 450))

    await win.webContents.executeJavaScript("location.hash = '#/instances'")
    await new Promise((resolve) => setTimeout(resolve, 900))
    await win.webContents.executeJavaScript(
      "[...document.querySelectorAll('button')].find((b) => b.textContent.includes('新建实例'))?.click()",
    )
    await new Promise((resolve) => setTimeout(resolve, 3500))
    const createModal = await win.webContents.capturePage()
    writeFileSync(join(app.getPath('userData'), 'screenshot-create.png'), createModal.toPNG())
    await win.webContents.executeJavaScript(
      "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))",
    )

    await win.webContents.executeJavaScript(
      "document.documentElement.dataset.theme='light'; location.hash='#/'; document.querySelector('main')?.scrollTo(0, 0)",
    )
    await new Promise((resolve) => setTimeout(resolve, 900))
    const light = await win.webContents.capturePage()
    writeFileSync(join(app.getPath('userData'), 'screenshot-light.png'), light.toPNG())
    console.log('screenshots written to', app.getPath('userData'))
    app.exit(0)
    return
  }

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
