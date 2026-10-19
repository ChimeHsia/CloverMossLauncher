import { Ipc } from '@shared/channels'
import type { GradioLaunchConfig } from '@shared/types'
import { call } from './api'

export type GradioOpenResult = 'opened' | 'copied'

/**
 * Single place that turns `GradioLaunchConfig.openMode` into an Electron action.
 * Both the manual "open interface" button and the auto-open-on-ready effect use it.
 */
export async function openGradioUi(
  url: string,
  mode: GradioLaunchConfig['openMode'] = 'browser',
  title?: string,
): Promise<GradioOpenResult> {
  if (mode === 'copy') {
    await call(Ipc.copyText, { text: url })
    return 'copied'
  }
  if (mode === 'app-window') {
    await call(Ipc.gradioOpen, { url, title })
    return 'opened'
  }
  await call(Ipc.openExternal, { url })
  return 'opened'
}
