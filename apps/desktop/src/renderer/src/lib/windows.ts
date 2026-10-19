import { Ipc } from '@shared/channels'
import { call } from './api'

export type WindowKind = 'launcher' | 'creator' | 'terminal' | 'trainer'

export function openWindow(kind: WindowKind, route?: string): void {
  void call(Ipc.windowOpen, { kind, route })
}
