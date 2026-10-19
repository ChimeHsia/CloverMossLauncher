export type CheckStatus = 'ok' | 'warn' | 'error' | 'unknown'

export type CheckActionKind =
  | 'rescan'
  | 'open-settings'
  | 'open-url'
  | 'install-python'
  | 'switch-mirror'

export interface CheckAction {
  id: string
  label: string
  kind: CheckActionKind
  url?: string
  payload?: string
}

export interface CheckItem {
  id: string
  group: 'system' | 'accelerator' | 'memory' | 'tools' | 'network' | 'ports'
  label: string
  status: CheckStatus
  value: string
  detail?: string
  actions?: CheckAction[]
}

export interface DeviceInfo {
  platform: string
  arch: string
  osVersion: string
  hostname: string
  cpuModel: string
  cpuCores: number
  memoryTotal: number
  memoryFree: number
  diskTotal: number
  diskFree: number
  dataPath: string
  modelsPath: string
  acrylic: boolean
}

export interface GpuInfo {
  kind: 'apple' | 'nvidia' | 'amd' | 'intel' | 'unknown'
  name: string
  cores?: number
  memoryBytes?: number
  metal?: boolean
  cuda?: string
  driver?: string
  available: boolean
}

export interface PythonInfo {
  path: string
  version: string
  source: 'system' | 'uv' | 'pyenv' | 'conda' | 'managed'
}

export interface ToolState {
  found: boolean
  version?: string
  path?: string
}

export interface NetworkProbe {
  id: string
  label: string
  url: string
  ok: boolean
  latencyMs: number | null
  error?: string
}

export interface NetworkSelection {
  git: string | null
  pip: string | null
  hf: string | null
  manifest: string | null
}

export interface NetworkReport {
  checkedAt: string
  mode: 'auto' | 'direct' | 'mirror'
  selected: NetworkSelection
  probes: NetworkProbe[]
}

export interface Recommendation {
  width: number
  height: number
  steps: number
  profile: 'base' | 'dmd8'
  quant: 'bf16' | 'int8' | 'int4'
  note: string
  estimatedLabel: string
}

export interface EnvReport {
  scannedAt: string
  appVersion: string
  device: DeviceInfo
  gpu: GpuInfo
  pythons: PythonInfo[]
  tools: { git: ToolState; uv: ToolState }
  network: NetworkReport
  checks: CheckItem[]
  recommendation: Recommendation
}

export interface Settings {
  theme: 'system' | 'light' | 'dark'
  language: 'zh-CN' | 'en'
  networkMode: 'auto' | 'direct' | 'mirror'
  gitMirror: string | null
  pipIndex: string | null
  hfEndpoint: string | null
  modelsRoot: string | null
  pythonPath: string | null
  autoCheckUpdates: boolean
  dismissedAnnouncements: string[]
}

export interface Announcement {
  id: string
  level: 'info' | 'success' | 'warning' | 'critical'
  title: string
  body: string
  bodyUrl?: string
  startsAt?: string
  endsAt?: string | null
  dismissible: boolean
  pinned: boolean
  action?: { label: string; kind: 'open_url' | 'check_update' | 'open_settings'; url?: string }
}

export interface UpdateState {
  checkedAt: string
  currentVersion: string
  latestVersion: string | null
  updateAvailable: boolean
  channel: 'stable' | 'beta'
  manifestSource: 'local' | 'remote' | 'cache' | 'none'
  announcements: Announcement[]
  error?: string
}

export interface BranchInfo {
  name: string
  sha: string
  isDefault: boolean
  isStable: boolean
}

export interface CommitInfo {
  sha: string
  short: string
  date: string
  subject: string
  author: string
}

export type InstanceChannel = 'stable' | 'experimental' | 'custom'
export type RuntimeMode = 'shared' | 'isolated'
export type RuntimeState = 'missing' | 'created' | 'installing' | 'ready' | 'error'

export interface InstanceInfo {
  id: string
  name: string
  source: string
  branch: string
  commit: string
  shortCommit: string
  commitDate: string
  subject: string
  author: string
  channel: InstanceChannel
  runtimeId: string
  runtimeMode: RuntimeMode
  runtimeState: RuntimeState
  models: string[]
  adapters: string[]
  createdAt: string
  lastUsedAt: string | null
  path: string
  dirty: boolean
  status: 'ok' | 'missing' | 'runtime-missing'
}

export interface RuntimeInfo {
  id: string
  instanceId: string
  instanceIds: string[]
  path: string
  python: string
  pythonVersion: string
  lockHash: string
  kind: RuntimeMode
  state: RuntimeState
  deps: string[]
  createdAt: string
}

export interface ModelEntry {
  id: string
  name: string
  provider: 'hf'
  repo: string
  revision: string
  role: 'full' | 'dit' | 'text_encoder' | 'vae'
  precision: string
  sizeBytes: number
  license: string
  tags: string[]
  notes?: string
  preview?: string
  installed: boolean
  installedBytes: number
}

export interface AdapterEntry {
  id: string
  name: string
  provider: 'hf'
  repo: string
  revision: string
  kind: 'lora' | 'lycoris' | 'dmd'
  base?: string
  license: string
  files: string[]
  sizeBytes: number
  requiresProfile?: string
  tags: string[]
  notes?: string
  installed: boolean
  installedBytes: number
}

export interface Catalog {
  updatedAt: string
  models: ModelEntry[]
  adapters: AdapterEntry[]
  source: 'local' | 'remote' | 'cache' | 'builtin'
}

export type DownloadState = 'queued' | 'running' | 'paused' | 'done' | 'error'

export interface DownloadTask {
  id: string
  kind: 'model' | 'adapter'
  targetId: string
  label: string
  state: DownloadState
  filesTotal: number
  filesDone: number
  bytes: number
  totalBytes: number
  speedBps: number
  currentFile?: string
  error?: string
  updatedAt: string
}

export interface AppInfo {
  name: string
  version: string
  electron: string
  chrome: string
  node: string
  platform: string
  arch: string
  dataPath: string
  modelsPath: string
}

export interface IpcError {
  code: string
  message: string
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError }
