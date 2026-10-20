import type { BackendInfo } from '@shared/backend'
import { Ipc } from '@shared/channels'
import type { ProjectDocument, ProjectSummary } from '@shared/types'
import { call } from './api'

export interface StudioProjectInput {
  id?: string
  name: string
  width: number
  height: number
  summary: ProjectDocument['summary']
  layers: ProjectDocument['layers']
  prompt: string
  negative: string
  seed: number
  steps: number
  cfg: number
  instanceId?: string
  backgroundPath?: string
}

/**
 * The Studio's data boundary. Electron uses IPC today; the LAN WebUI will
 * provide an HTTP/WS implementation of this same interface.
 */
export interface StudioClient {
  listProjects(): Promise<ProjectSummary[]>
  getProject(id: string): Promise<ProjectDocument | null>
  saveProject(input: StudioProjectInput): Promise<ProjectDocument>
  backendInfo(): Promise<BackendInfo>
}

export const electronStudioClient: StudioClient = {
  listProjects: () => call<ProjectSummary[]>(Ipc.projectsList),
  getProject: (id) => call<ProjectDocument | null>(Ipc.projectGet, { id }),
  saveProject: (input) => call<ProjectDocument>(Ipc.projectSave, input),
  backendInfo: () => call<BackendInfo>(Ipc.backendInfo),
}
