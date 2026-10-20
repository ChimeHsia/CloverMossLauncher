export interface BackendInfo {
  ready: boolean
  url: string | null
  token: string | null
  error?: string
}

export interface BackendRpc {
  type: 'rpc'
  id: string
  method: 'startJob' | 'cancelJob' | 'getJob' | 'listJobs'
  params?: unknown
}

export interface WebAccessInfo {
  ready: boolean
  urls: string[]
  error?: string
}
