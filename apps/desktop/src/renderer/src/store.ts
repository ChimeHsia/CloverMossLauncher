import { create } from 'zustand'
import { Events, Ipc } from '@shared/channels'
import type {
  AppNotification,
  Catalog,
  Diagnostic,
  DownloadTask,
  EnvReport,
  GalleryItem,
  InstanceInfo,
  JobLogLine,
  JobRecord,
  JobStartInput,
  Settings,
  UpdateState,
} from '@shared/types'
import type { LayoutDraft } from './lib/layout'
import { call, onEvent } from './lib/api'

function applyTheme(theme: Settings['theme']): void {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const dark = theme === 'dark' || (theme === 'system' && prefersDark)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

interface RuntimeLogEvent {
  runtimeId: string
  instanceId: string
  line: string
  stream: 'stdout' | 'stderr'
  at: string
}

interface AppStore {
  ready: boolean
  loading: boolean
  settings: Settings | null
  env: EnvReport | null
  updates: UpdateState | null
  instances: InstanceInfo[]
  catalog: Catalog | null
  downloads: DownloadTask[]
  jobs: JobRecord[]
  activeJobId: string | null
  jobLogs: Record<string, JobLogLine[]>
  diagnostics: Diagnostic[]
  notifications: AppNotification[]
  notificationsOpen: boolean
  studioPrompt: string
  studioDraft: LayoutDraft | null
  studioBackground: GalleryItem | null
  scanning: boolean
  scanSection: string | null
  gitMessage: string | null
  runtimeLogs: Record<string, string[]>
  error: string | null
  init: () => Promise<void>
  refreshEnv: () => Promise<void>
  refreshInstances: () => Promise<void>
  refreshCatalog: () => Promise<void>
  refreshUpdates: () => Promise<void>
  saveSettings: (patch: Partial<Settings>) => Promise<void>
  toggleSidebar: () => Promise<void>
  toggleNotifications: () => void
  setNotificationsOpen: (open: boolean) => void
  pushNotification: (input: Omit<AppNotification, 'id' | 'createdAt' | 'read'>) => void
  markAllNotificationsRead: () => void
  setStudioPrompt: (prompt: string) => void
  setStudioDraft: (draft: LayoutDraft | null) => void
  setStudioBackground: (item: GalleryItem | null) => void
  dismissAnnouncement: (id: string) => Promise<void>
  downloadModel: (modelId: string) => Promise<void>
  downloadAdapter: (adapterId: string) => Promise<void>
  pauseDownload: (taskId: string) => Promise<void>
  deleteModel: (kind: 'model' | 'adapter', id: string) => Promise<void>
  refreshJobs: () => Promise<void>
  startJob: (input: JobStartInput) => Promise<JobRecord>
  cancelJob: (id: string) => Promise<void>
  sendJobInput: (id: string, text: string) => Promise<void>
  setActiveJob: (id: string | null) => void
  loadJobLogs: (id: string) => Promise<void>
  refreshDiagnostics: () => Promise<void>
  dismissDiagnostic: (id: string) => Promise<void>
  clearDiagnostics: () => Promise<void>
}

let subscribed = false

function upsertJob(list: JobRecord[], job: JobRecord): JobRecord[] {
  return [job, ...list.filter((item) => item.id !== job.id)].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

function upsertDiagnostic(list: Diagnostic[], diagnostic: Diagnostic): Diagnostic[] {
  return [diagnostic, ...list.filter((item) => item.id !== diagnostic.id)].slice(0, 200)
}

function upsertDownload(list: DownloadTask[], task: DownloadTask): DownloadTask[] {
  const next = list.filter((item) => item.id !== task.id)
  next.unshift(task)
  return next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export const useApp = create<AppStore>((set, get) => {
  function subscribe(): void {
    if (subscribed) return
    subscribed = true

    onEvent<DownloadTask>(Events.download, (task) => {
      set((state) => ({ downloads: upsertDownload(state.downloads, task) }))
      if (task.state === 'done') {
        void get().refreshCatalog()
        get().pushNotification({
          tone: 'success',
          title: '下载完成',
          message: `${task.label} 已写入本地缓存`,
        })
      } else if (task.state === 'error') {
        get().pushNotification({
          tone: 'error',
          title: '下载失败',
          message: task.error ?? task.label,
        })
      }
    })
    onEvent<{ id: string }>(Events.instancesChanged, () => {
      void get().refreshInstances()
    })
    onEvent<JobRecord>(Events.job, (job) => {
      const previous = get().jobs.find((item) => item.id === job.id)
      set((state) => ({
        jobs: upsertJob(state.jobs, job),
        activeJobId: state.activeJobId ?? job.id,
      }))
      if (job.state === 'succeeded' && previous?.state !== 'succeeded') {
        get().pushNotification({
          tone: 'success',
          title: '生成完成',
          message: `${job.instanceName} · ${job.params.width}×${job.params.height}`,
        })
      } else if (job.state === 'failed' && previous?.state !== 'failed') {
        get().pushNotification({
          tone: 'error',
          title: '任务失败',
          message: job.error?.message ?? '查看诊断页了解原因',
        })
      }
    })

    onEvent<JobLogLine>(Events.jobLog, (line) => {
      set((state) => {
        const previous = state.jobLogs[line.jobId] ?? []
        return {
          jobLogs: {
            ...state.jobLogs,
            [line.jobId]: [...previous.slice(-1499), line],
          },
        }
      })
    })

    onEvent<Diagnostic>(Events.diagnostic, (diagnostic) => {
      set((state) => ({ diagnostics: upsertDiagnostic(state.diagnostics, diagnostic) }))
    })

    onEvent<Settings>(Events.settingsChanged, (settings) => {
      applyTheme(settings.theme)
      set({ settings })
    })
    onEvent<{ section: string }>(Events.envProgress, (event) => {
      set({ scanSection: event.section })
    })
    onEvent<{ message: string }>(Events.gitProgress, (event) => {
      set({ gitMessage: event.message })
    })
    onEvent<RuntimeLogEvent>(Events.runtimeLog, (event) => {
      set((state) => {
        const previous = state.runtimeLogs[event.instanceId] ?? []
        const line = `${new Date(event.at).toLocaleTimeString('zh-CN', { hour12: false })}  ${event.line}`
        return {
          runtimeLogs: {
            ...state.runtimeLogs,
            [event.instanceId]: [...previous.slice(-499), line],
          },
        }
      })
    })

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      const settings = get().settings
      if (settings) applyTheme(settings.theme)
    })
  }

  return {
    ready: false,
    loading: false,
    settings: null,
    env: null,
    updates: null,
    instances: [],
    catalog: null,
    downloads: [],
    jobs: [],
    activeJobId: null,
    jobLogs: {},
    diagnostics: [],
    notifications: [],
    notificationsOpen: true,
    studioPrompt: '',
    studioDraft: null,
    studioBackground: null,
    scanning: false,
    scanSection: null,
    gitMessage: null,
    runtimeLogs: {},
    error: null,

    async init() {
      if (get().ready || get().loading) return
      set({ loading: true, error: null })
      try {
        document.documentElement.dataset.acrylic = String(window.clover.acrylic)
        const settings = await call<Settings>(Ipc.settingsGet)
        applyTheme(settings.theme)
        set({ settings })
        subscribe()

        const [env, updates, instances, catalog, downloads, jobs, diagnostics] = await Promise.allSettled([
          call<EnvReport>(Ipc.envScan),
          call<UpdateState>(Ipc.updatesCheck),
          call<InstanceInfo[]>(Ipc.instancesList),
          call<Catalog>(Ipc.modelsCatalog),
          call<DownloadTask[]>(Ipc.downloadsList),
          call<JobRecord[]>(Ipc.jobList),
          call<Diagnostic[]>(Ipc.diagnosticsList),
        ])
        set({
          env: env.status === 'fulfilled' ? env.value : null,
          updates: updates.status === 'fulfilled' ? updates.value : null,
          instances: instances.status === 'fulfilled' ? instances.value : [],
          catalog: catalog.status === 'fulfilled' ? catalog.value : null,
          downloads: downloads.status === 'fulfilled' ? downloads.value : [],
          jobs: jobs.status === 'fulfilled' ? jobs.value : [],
          diagnostics: diagnostics.status === 'fulfilled' ? diagnostics.value : [],
          activeJobId:
            jobs.status === 'fulfilled'
              ? (jobs.value.find((job) => job.state === 'running' || job.state === 'starting')?.id ?? null)
              : null,
          ready: true,
        })
        if (updates.status === 'fulfilled' && updates.value.updateAvailable) {
          get().pushNotification({
            tone: 'info',
            title: '发现新版本',
            message: `CloverMoss ${updates.value.latestVersion} 可用`,
          })
        }
      } catch (error) {
        set({ error: error instanceof Error ? error.message : String(error) })
      } finally {
        set({ loading: false })
      }
    },

    async refreshEnv() {
      set({ scanning: true, scanSection: 'system' })
      try {
        const env = await call<EnvReport>(Ipc.envScan)
        set({ env })
      } catch (error) {
        set({ error: error instanceof Error ? error.message : String(error) })
      } finally {
        set({ scanning: false, scanSection: null })
      }
    },

    async refreshInstances() {
      try {
        const instances = await call<InstanceInfo[]>(Ipc.instancesList)
        set({ instances })
      } catch {
        // keep previous list
      }
    },

    async refreshCatalog() {
      try {
        const catalog = await call<Catalog>(Ipc.modelsCatalog)
        set({ catalog })
      } catch {
        // keep previous
      }
    },

    async refreshUpdates() {
      try {
        const updates = await call<UpdateState>(Ipc.updatesCheck)
        set({ updates })
      } catch {
        // keep previous
      }
    },

    async saveSettings(patch) {
      const settings = await call<Settings>(Ipc.settingsUpdate, patch)
      applyTheme(settings.theme)
      set({ settings })
    },

    async toggleSidebar() {
      const settings = get().settings
      if (!settings) return
      await get().saveSettings({ sidebarCollapsed: !settings.sidebarCollapsed })
    },

    toggleNotifications() {
      set((state) => ({ notificationsOpen: !state.notificationsOpen }))
    },

    setNotificationsOpen(open) {
      set({ notificationsOpen: open })
    },

    pushNotification(input) {
      set((state) => ({
        notifications: [
          {
            ...input,
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            read: false,
          },
          ...state.notifications,
        ].slice(0, 50),
      }))
    },

    markAllNotificationsRead() {
      set((state) => ({
        notifications: state.notifications.map((item) => ({ ...item, read: true })),
      }))
    },

    setStudioPrompt(prompt) {
      set({ studioPrompt: prompt })
    },

    setStudioDraft(draft) {
      set({ studioDraft: draft })
    },

    setStudioBackground(item) {
      set({ studioBackground: item })
    },

    async dismissAnnouncement(id) {
      await call(Ipc.announcementsDismiss, { id })
      await get().refreshUpdates()
    },

    async downloadModel(modelId) {
      const task = await call<DownloadTask>(Ipc.modelDownload, { kind: 'model', id: modelId })
      set((state) => ({ downloads: upsertDownload(state.downloads, task) }))
    },

    async downloadAdapter(adapterId) {
      const task = await call<DownloadTask>(Ipc.modelDownload, { kind: 'adapter', id: adapterId })
      set((state) => ({ downloads: upsertDownload(state.downloads, task) }))
    },

    async pauseDownload(taskId) {
      await call(Ipc.modelPause, { taskId })
    },

    async deleteModel(kind, id) {
      await call(Ipc.modelDelete, { kind, id })
      await get().refreshCatalog()
    },

    async refreshJobs() {
      try {
        const jobs = await call<JobRecord[]>(Ipc.jobList)
        set({ jobs })
      } catch {
        // keep previous
      }
    },

    async startJob(input) {
      const job = await call<JobRecord>(Ipc.jobStart, input)
      set((state) => ({
        jobs: upsertJob(state.jobs, job),
        activeJobId: job.id,
        jobLogs: { ...state.jobLogs, [job.id]: [] },
      }))
      return job
    },

    async cancelJob(id) {
      const job = await call<JobRecord | null>(Ipc.jobCancel, { id })
      if (job) {
        set((state) => ({ jobs: upsertJob(state.jobs, job) }))
      }
    },

    async sendJobInput(id, text) {
      await call(Ipc.jobInput, { id, text })
    },

    setActiveJob(id) {
      set({ activeJobId: id })
    },

    async loadJobLogs(id) {
      try {
        const lines = await call<JobLogLine[]>(Ipc.jobLogs, { id })
        set((state) => ({ jobLogs: { ...state.jobLogs, [id]: lines } }))
      } catch {
        // ignore
      }
    },

    async refreshDiagnostics() {
      try {
        const diagnostics = await call<Diagnostic[]>(Ipc.diagnosticsList)
        set({ diagnostics })
      } catch {
        // ignore
      }
    },

    async dismissDiagnostic(id) {
      await call(Ipc.diagnosticsDismiss, { id })
      set((state) => ({ diagnostics: state.diagnostics.filter((item) => item.id !== id) }))
    },

    async clearDiagnostics() {
      await call(Ipc.diagnosticsClear)
      set({ diagnostics: [] })
    },
  }
})
