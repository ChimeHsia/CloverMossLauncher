import { z } from 'zod'

const pathLike = z.string().min(1).max(4096)
const urlLike = z.string().min(8).max(2048).regex(/^https?:\/\//)

export const schemas = {
  settingsUpdate: z
    .object({
      theme: z.enum(['system', 'light', 'dark']),
      language: z.enum(['zh-CN', 'en']),
      networkMode: z.enum(['auto', 'direct', 'mirror']),
      gitMirror: z.string().max(2048).nullable(),
      pipIndex: z.string().max(2048).nullable(),
      hfEndpoint: z.string().max(2048).nullable(),
      modelsRoot: z.string().max(4096).nullable(),
      pythonPath: z.string().max(4096).nullable(),
      autoCheckUpdates: z.boolean(),
      sidebarCollapsed: z.boolean(),
      galleryRoots: z.array(z.string().max(4096)).max(20),
      homeBackground: z.string().max(4096).nullable(),
    })
    .partial(),

  gitCommits: z.object({
    branch: z.string().min(1).max(120),
    limit: z.number().int().min(1).max(200).default(60),
  }),

  instanceCreate: z.object({
    branch: z.string().min(1).max(120),
    commit: z.string().regex(/^[0-9a-f]{7,40}$/),
    name: z.string().min(1).max(60).optional(),
    runtimeMode: z.enum(['shared', 'isolated']).default('shared'),
    source: urlLike.optional(),
  }),

  instanceDelete: z.object({
    id: z.string().min(1).max(120),
    keepOutputs: z.boolean().default(true),
  }),

  instanceUpdate: z.object({
    id: z.string().min(1).max(120),
    commit: z.string().regex(/^[0-9a-f]{7,40}$/),
  }),

  instanceId: z.object({ id: z.string().min(1).max(120) }),

  instanceOpen: z.object({ id: z.string().min(1).max(120) }),

  runtimeInstall: z.object({ instanceId: z.string().min(1).max(120) }),

  download: z.object({
    kind: z.enum(['model', 'adapter']),
    id: z.string().min(1).max(160),
  }),

  modelPause: z.object({ taskId: z.string().min(1).max(160) }),

  downloadDelete: z.object({
    kind: z.enum(['model', 'adapter']),
    id: z.string().min(1).max(160),
  }),

  announcementsDismiss: z.object({ id: z.string().min(1).max(120) }),

  windowOpen: z.object({
    kind: z.enum(['launcher', 'creator', 'terminal']),
    route: z.string().regex(/^\/[a-z0-9/_-]*$/i).max(120).optional(),
  }),

  caseSave: z.object({
    id: z.string().max(80).optional(),
    name: z.string().max(120).optional(),
    instanceId: z.string().min(1).max(120),
    backend: z.enum(['official', 'clover']),
    deviceId: z.string().min(1).max(120),
    profile: z.enum(['base', 'dmd8']),
    port: z.number().int().min(1024).max(65535).nullable().optional(),
    extraArgs: z.string().max(2000).optional(),
  }),

  caseRemove: z.object({ id: z.string().min(1).max(80) }),

  jobStart: z.object({
    instanceId: z.string().min(1).max(120),
    prompt: z.string().max(32768),
    negativePrompt: z.string().max(8192).default(''),
    width: z.number().int().min(256).max(2048).multipleOf(16),
    height: z.number().int().min(256).max(2048).multipleOf(16),
    steps: z.number().int().min(1).max(100),
    cfg: z.number().min(0).max(20),
    seed: z.number().int().min(0).max(4294967295),
    profile: z.enum(['base', 'dmd8']).default('base'),
    mode: z.enum(['runner', 'gradio', 'simulate']).default('runner'),
    caseId: z.string().max(80).optional(),
    caseName: z.string().max(120).optional(),
    backend: z.enum(['official', 'clover']).optional(),
    deviceId: z.string().max(120).optional(),
    port: z.number().int().min(1024).max(65535).nullable().optional(),
    extraArgs: z.string().max(2000).optional(),
  }),

  jobId: z.object({ id: z.string().min(1).max(120) }),

  jobInput: z.object({
    id: z.string().min(1).max(120),
    text: z.string().max(4096),
  }),

  diagnosticsDismiss: z.object({ id: z.string().min(1).max(120) }),

  galleryList: z.object({
    cursor: z.string().max(32).optional(),
    limit: z.number().int().min(1).max(120).default(48),
    query: z.string().max(200).optional(),
    root: z.string().max(4096).optional(),
  }),

  galleryItem: z.object({ path: pathLike }),

  galleryReveal: z.object({ path: pathLike }),

  pickDialog: z.object({
    kind: z.enum(['folder', 'image']).default('folder'),
    title: z.string().max(120).optional(),
  }),

  openPath: z.object({ path: pathLike }),

  openExternal: z.object({ url: urlLike }),
}

export type Schemas = typeof schemas
