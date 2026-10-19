import type { IpcError, IpcResult } from '@shared/types'

export class ApiError extends Error {
  code: string
  constructor(error: IpcError) {
    super(error.message)
    this.code = error.code
  }
}

export async function call<T>(channel: string, payload?: unknown): Promise<T> {
  const result = await window.clover.invoke<IpcResult<T>>(channel, payload)
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

export function onEvent<T>(channel: string, callback: (data: T) => void): () => void {
  return window.clover.on(channel, (data) => callback(data as T))
}

export function platform(): string {
  return window.clover.platform
}
