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

  openPath: z.object({ path: pathLike }),

  openExternal: z.object({ url: urlLike }),
}

export type Schemas = typeof schemas
