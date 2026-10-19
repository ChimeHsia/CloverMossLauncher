import { app, dialog, ipcMain, shell } from 'electron'
import { ZodError, type ZodType } from 'zod'
import { Events, Ipc } from '@shared/channels'
import { schemas } from '@shared/schemas'
import type { IpcResult } from '@shared/types'
import { emit } from './lib/events'
import { ensureDirs, paths } from './lib/paths'
import { scanEnvironment } from './services/env'
import {
  createInstance,
  deleteInstance,
  getInstance,
  isolateInstance,
  listInstances,
  updateAdapterBindings,
  updateInstance,
} from './services/instances'
import { getCatalog, deleteModel, listDownloads, pauseDownload, startDownload } from './services/models'
import { galleryDetail, listGallery, revealInFolder } from './services/gallery'
import { cancelJob, getJob, getJobLogs, inputJob, listJobs, startJob } from './services/supervisor'
import { clearDiagnostics, dismissDiagnostic, listDiagnostics } from './services/diagnostics'
import { ensureMirror, listBranches, listCommits } from './services/git'
import { installDeps, readRuntime } from './services/runtimes'
import { getSettings, updateSettings } from './services/settings'
import { checkUpdates, dismissAnnouncement } from './services/updates'
import { isInside } from './lib/paths'
import { openWindow } from './windows'
import { listDevices } from './services/devices'
import { listCases, removeCase, saveCase } from './services/cases'
import { getOnboardingStatus } from './services/onboarding'
import {
  createTrainerVersion,
  ensureTrainerRuntime,
  installTrainerRuntime,
  listAllTrainerVersions,
  listTrainerVersions,
  removeTrainerVersion,
  trainerDoctor,
  trainerMirrorInfo,
  startTrainerRun,
} from './services/trainers'
import { listTrainerBranches, listTrainerCommits } from './services/trainerGit'
import { listLaunchRows, removeLaunchRow, upsertLaunchRow } from './services/launchQueue'
import { listTrainingHosts, removeTrainingHost, saveTrainingHost, testTrainingHost } from './services/trainingHosts'
import {
  remoteBranches,
  remoteCommits,
  remoteCreateVersion,
  remoteDoctor,
  remoteInstallRuntime,
  remoteRemoveVersion,
  remoteVersion,
  remoteVersions,
} from './services/remoteTrainer'

function toResult<T>(fn: () => Promise<T> | T): Promise<IpcResult<T>> {
  return Promise.resolve()
    .then(fn)
    .then((data) => ({ ok: true as const, data }))
    .catch((error: unknown) => ({
      ok: false as const,
      error: {
        code: error instanceof ZodError ? 'BAD_REQUEST' : 'INTERNAL',
        message:
          error instanceof ZodError
            ? error.issues[0]?.message ?? '参数不合法'
            : error instanceof Error
              ? error.message
              : String(error),
      },
    }))
}

function handle<T>(channel: string, schema: ZodType | null, fn: (input: any) => Promise<T> | T): void {
  ipcMain.handle(channel, async (_event, payload: unknown) =>
    toResult(async () => {
      const input = schema ? schema.parse(payload ?? {}) : payload
      return await fn(input)
    }),
  )
}

export function registerIpc(): void {
  handle(Ipc.appInfo, null, () => ({
    name: 'CloverMoss Launcher',
    version: app.getVersion(),
    electron: process.versions.electron ?? '',
    chrome: process.versions.chrome ?? '',
    node: process.versions.node ?? '',
    platform: process.platform,
    arch: process.arch,
    dataPath: paths.root(),
    modelsPath: paths.models(getSettings().modelsRoot),
    acrylic: process.platform === 'darwin' || process.platform === 'win32',
  }))

  handle(Ipc.windowOpen, schemas.windowOpen, ({ kind, route }) => {
    openWindow(kind, route)
    return true
  })

  handle(Ipc.devicesList, null, () => listDevices())

  handle(Ipc.casesList, null, () => listCases())

  handle(Ipc.casesSave, schemas.caseSave, (input) => saveCase(input))

  handle(Ipc.casesRemove, schemas.caseRemove, ({ id }) => {
    removeCase(id)
    return true
  })

  handle(Ipc.onboardingStatus, null, () => getOnboardingStatus(getSettings()))

  handle(Ipc.trainerMirror, null, () => trainerMirrorInfo(getSettings()))

  handle(Ipc.trainerHosts, null, () => listTrainingHosts(getSettings()))

  handle(Ipc.trainerHostSave, schemas.trainerHostSave, (input) => saveTrainingHost(input))

  handle(Ipc.trainerHostRemove, schemas.trainerHostRemove, ({ id }) => {
    removeTrainingHost(id)
    return true
  })

  handle(Ipc.trainerHostTest, schemas.trainerHostTest, ({ id }) => testTrainingHost(getSettings(), id))

  handle(Ipc.trainerRemoteBranches, schemas.trainerRemoteHost, ({ hostId }) => remoteBranches(getSettings(), hostId))

  handle(Ipc.trainerRemoteCommits, schemas.trainerRemoteCommits, ({ hostId, branch, limit }) =>
    remoteCommits(getSettings(), hostId, branch, limit),
  )

  handle(Ipc.trainerRemoteVersions, schemas.trainerRemoteHost, ({ hostId }) => remoteVersions(getSettings(), hostId))

  handle(Ipc.trainerRemoteCreate, schemas.trainerRemoteCreate, ({ hostId, ...input }) =>
    remoteCreateVersion(getSettings(), hostId, input),
  )

  handle(Ipc.trainerRemoteInstall, schemas.trainerRemoteVersion, ({ hostId, versionId }) =>
    remoteInstallRuntime(getSettings(), remoteVersion(getSettings(), hostId, versionId)),
  )

  handle(Ipc.trainerRemoteDoctor, schemas.trainerRemoteVersion, ({ hostId, versionId }) =>
    remoteDoctor(getSettings(), remoteVersion(getSettings(), hostId, versionId)),
  )

  handle(Ipc.trainerRemoteRemove, schemas.trainerRemoteVersion, async ({ hostId, versionId }) => {
    await remoteRemoveVersion(getSettings(), remoteVersion(getSettings(), hostId, versionId))
    return true
  })

  handle(Ipc.trainerBranches, null, () => listTrainerBranches(getSettings()))

  handle(Ipc.trainerCommits, schemas.trainerCommits, ({ branch, limit }) =>
    listTrainerCommits(getSettings(), branch, limit),
  )

  handle(Ipc.trainerVersions, null, () => listTrainerVersions(getSettings()))

  handle(Ipc.trainerAllVersions, null, () => listAllTrainerVersions(getSettings()))

  handle(Ipc.trainerCreate, schemas.trainerCreate, (input) => createTrainerVersion(getSettings(), input))

  handle(Ipc.trainerRemove, schemas.trainerId, async ({ id }) => {
    await removeTrainerVersion(getSettings(), id)
    return true
  })

  handle(Ipc.trainerInstall, schemas.trainerId, ({ id }) => installTrainerRuntime(getSettings(), id))

  handle(Ipc.trainerDoctor, schemas.trainerId, ({ id }) => trainerDoctor(getSettings(), id))

  handle(Ipc.trainerRun, schemas.trainerRun, (input) => startTrainerRun(getSettings(), input))

  handle(Ipc.settingsGet, null, () => getSettings())

  handle(Ipc.settingsUpdate, schemas.settingsUpdate, (patch) => {
    const settings = updateSettings(patch)
    ensureDirs(settings.modelsRoot)
    emit(Events.settingsChanged, settings)
    return settings
  })

  handle(Ipc.envScan, null, () => scanEnvironment(getSettings(), (event) => emit(Events.envProgress, event)))

  handle(Ipc.updatesCheck, null, () => checkUpdates(getSettings()))

  handle(Ipc.announcementsDismiss, schemas.announcementsDismiss, ({ id }) => {
    dismissAnnouncement(id)
    return true
  })

  handle(Ipc.gitBranches, null, async () => {
    const settings = getSettings()
    await ensureMirror(settings)
    return listBranches()
  })

  handle(Ipc.gitCommits, schemas.gitCommits, ({ branch, limit }) => listCommits(branch, limit))

  handle(Ipc.instancesList, null, () => listInstances())

  handle(Ipc.instanceCreate, schemas.instanceCreate, (input) => createInstance(input, getSettings()))

  handle(Ipc.instanceDelete, schemas.instanceDelete, ({ id, keepOutputs }) => deleteInstance(id, keepOutputs))

  handle(Ipc.instanceUpdate, schemas.instanceUpdate, ({ id, commit }) => updateInstance(id, commit))

  handle(Ipc.instanceAdapters, schemas.instanceAdapters, ({ id, bindings }) => updateAdapterBindings(id, bindings))

  handle(Ipc.instanceOpen, schemas.instanceOpen, async ({ id }) => {
    const instance = await getInstance(id)
    if (!instance) throw new Error('实例不存在')
    return shell.openPath(instance.path)
  })

  handle(Ipc.runtimeInstall, schemas.runtimeInstall, async ({ instanceId }) => {
    const instance = await getInstance(instanceId)
    if (!instance) throw new Error('实例不存在')
    const runtime = await installDeps(instance.runtimeId, getSettings(), (line, stream) => {
      emit(Events.runtimeLog, {
        runtimeId: instance.runtimeId,
        instanceId,
        line,
        stream,
        at: new Date().toISOString(),
      })
    })
    emit(Events.instancesChanged, { id: instanceId })
    return runtime
  })

  handle(Ipc.runtimeIsolate, schemas.instanceId, ({ id }) => isolateInstance(id, getSettings()))

  handle(Ipc.runtimeState, schemas.instanceId, async ({ id }) => {
    const instance = await getInstance(id)
    if (!instance) return null
    return readRuntime(instance.runtimeId)
  })

  handle(Ipc.modelsCatalog, null, () => getCatalog(getSettings(), true))

  handle(Ipc.modelsInstalled, null, async () => {
    const catalog = await getCatalog(getSettings())
    return catalog.models.filter((model) => model.installed)
  })

  handle(Ipc.modelDownload, schemas.download, ({ kind, id }) =>
    startDownload(kind, id, getSettings()),
  )

  handle(Ipc.modelPause, schemas.modelPause, ({ taskId }) => {
    pauseDownload(taskId)
    return true
  })

  handle(Ipc.modelDelete, schemas.downloadDelete, async ({ kind, id }) => {
    await deleteModel(kind, id, getSettings())
    return true
  })

  handle(Ipc.downloadsList, null, () => listDownloads())

  handle(Ipc.jobStart, schemas.jobStart, (input) => startJob(input))

  handle(Ipc.jobCancel, schemas.jobId, ({ id }) => cancelJob(id))

  handle(Ipc.jobList, null, () => listJobs())

  handle(Ipc.jobGet, schemas.jobId, ({ id }) => getJob(id))

  handle(Ipc.jobLogs, schemas.jobId, ({ id }) => getJobLogs(id))

  handle(Ipc.jobInput, schemas.jobInput, ({ id, text }) => {
    inputJob(id, text)
    return true
  })

  handle(Ipc.jobOpenLog, schemas.jobId, async ({ id }) => {
    const job = await getJob(id)
    if (job?.logPath) shell.showItemInFolder(job.logPath)
    return true
  })

  handle(Ipc.diagnosticsList, null, () => listDiagnostics())

  handle(Ipc.diagnosticsDismiss, schemas.diagnosticsDismiss, ({ id }) => {
    dismissDiagnostic(id)
    return true
  })

  handle(Ipc.diagnosticsClear, null, () => {
    clearDiagnostics()
    return true
  })

  handle(Ipc.galleryList, schemas.galleryList, (input) => listGallery(getSettings(), input))

  handle(Ipc.galleryItem, schemas.galleryItem, ({ path }) => galleryDetail(path))

  handle(Ipc.galleryReveal, schemas.galleryReveal, ({ path }) => revealInFolder(path))

  handle(Ipc.pickDialog, schemas.pickDialog, async ({ kind, title }) => {
    const result = await dialog.showOpenDialog({
      title,
      properties: kind === 'folder' ? ['openDirectory', 'createDirectory'] : ['openFile'],
      filters:
        kind === 'image'
          ? [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
          : undefined,
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  handle(Ipc.openPath, schemas.openPath, async ({ path }) => {
    const allowed = [paths.root(), paths.models(getSettings().modelsRoot)]
    if (!allowed.some((base) => isInside(base, path))) throw new Error('路径不在允许范围内')
    return shell.openPath(path)
  })

  handle(Ipc.openExternal, schemas.openExternal, async ({ url }) => {
    if (!/^https:\/\//.test(url)) throw new Error('只允许打开 https 链接')
    await shell.openExternal(url)
    return true
  })
}
