export const Ipc = {
  appInfo: 'app:info',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  envScan: 'env:scan',
  updatesCheck: 'updates:check',
  announcementsDismiss: 'announcements:dismiss',
  gitBranches: 'git:branches',
  gitCommits: 'git:commits',
  instancesList: 'instances:list',
  instanceCreate: 'instances:create',
  instanceDelete: 'instances:delete',
  instanceUpdate: 'instances:update',
  instanceOpen: 'instance:open',
  runtimeInstall: 'runtime:install',
  runtimeIsolate: 'runtime:isolate',
  runtimeState: 'runtime:state',
  modelsCatalog: 'models:catalog',
  modelsInstalled: 'models:installed',
  modelDownload: 'models:download',
  modelPause: 'models:pause',
  modelDelete: 'models:delete',
  downloadsList: 'downloads:list',
  openPath: 'app:open-path',
  openExternal: 'app:open-external',
} as const

export type IpcChannel = (typeof Ipc)[keyof typeof Ipc]

export const Events = {
  envProgress: 'event:env-progress',
  gitProgress: 'event:git-progress',
  runtimeLog: 'event:runtime-log',
  download: 'event:download',
  instancesChanged: 'event:instances-changed',
  settingsChanged: 'event:settings-changed',
} as const

export type EventChannel = (typeof Events)[keyof typeof Events]
