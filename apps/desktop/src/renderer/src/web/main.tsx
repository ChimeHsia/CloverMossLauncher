import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Catalog, InstanceInfo, JobRecord, ProjectSummary } from '@shared/types'
import '../styles.css'

const TOKEN_KEY = 'mossstudio.web.token'

function readToken(): string {
  const url = new URL(window.location.href)
  const fromUrl = url.searchParams.get('token')
  if (fromUrl) {
    localStorage.setItem(TOKEN_KEY, fromUrl)
    url.searchParams.delete('token')
    window.history.replaceState({}, '', url.pathname + url.search + url.hash)
    return fromUrl
  }
  return localStorage.getItem(TOKEN_KEY) ?? ''
}

async function api<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `HTTP ${response.status}`)
  }
  return (await response.json()) as T
}

interface Bootstrap {
  projects: ProjectSummary[]
  instances: InstanceInfo[]
  models: Catalog
}

const SIZES: Array<[string, number, number]> = [
  ['512²', 512, 512],
  ['768²', 768, 768],
  ['1024²', 1024, 1024],
  ['1024×768', 1024, 768],
  ['768×1024', 768, 1024],
]

function App(): React.JSX.Element {
  const [token, setToken] = useState(readToken)
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null)
  const [error, setError] = useState('')
  const [instanceId, setInstanceId] = useState('')
  const [prompt, setPrompt] = useState('')
  const [negative, setNegative] = useState('')
  const [width, setWidth] = useState(1024)
  const [height, setHeight] = useState(1024)
  const [steps, setSteps] = useState(8)
  const [cfg, setCfg] = useState(1)
  const [seed, setSeed] = useState(42)
  const [job, setJob] = useState<JobRecord | null>(null)
  const [busy, setBusy] = useState(false)
  const [projectName, setProjectName] = useState('MossStudio Project')

  const loaded = useMemo(() => Boolean(bootstrap), [bootstrap])

  async function load(nextToken = token): Promise<void> {
    if (!nextToken) return
    try {
      setError('')
      const data = await api<Bootstrap>(nextToken, '/api/studio/bootstrap')
      setBootstrap(data)
      setInstanceId((current) => current || data.instances[0]?.id || '')
    } catch (cause) {
      setBootstrap(null)
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  useEffect(() => {
    void load()
  }, [token])

  useEffect(() => {
    if (!job || !token) return
    if (job.state === 'succeeded' || job.state === 'failed' || job.state === 'canceled') return
    const timer = setInterval(() => {
      void api<JobRecord>(token, `/api/jobs/${encodeURIComponent(job.id)}`).then(setJob).catch(() => undefined)
    }, 1800)
    return () => clearInterval(timer)
  }, [job, token])

  async function generate(): Promise<void> {
    if (!instanceId || !prompt.trim()) {
      setError('先选择实例并写提示词')
      return
    }
    setBusy(true)
    setError('')
    try {
      const next = await api<JobRecord>(token, '/api/jobs', {
        method: 'POST',
        body: JSON.stringify({
          instanceId,
          prompt,
          negativePrompt: negative,
          width,
          height,
          steps,
          cfg,
          seed,
          profile: steps <= 8 ? 'dmd8' : 'base',
          workspace: 'clover',
          mode: 'runner',
        }),
      })
      setJob(next)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  async function saveProject(): Promise<void> {
    try {
      await api(token, '/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: projectName,
          width,
          height,
          summary: { caption: prompt.slice(0, 300), meta: ['web'], canvas: 'single' },
          layers: [],
          prompt,
          negative,
          seed,
          steps,
          cfg,
          instanceId: instanceId || undefined,
        }),
      })
      setError('')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  if (!token || !loaded) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 bg-[#191b1f] px-5 text-[var(--color-text)]">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">MossStudio · LAN</div>
          <h1 className="mt-2 text-[24px] font-semibold">连接到桌面主机</h1>
          <p className="mt-1 text-[12px] leading-5 text-[var(--color-text-secondary)]">
            {error || '输入桌面端「设置 → 局域网 WebUI」里显示的访问令牌。'}
          </p>
        </div>
        <input
          value={token}
          onChange={(event) => setToken(event.target.value.trim())}
          placeholder="访问令牌"
          className="app-input w-full"
        />
        <button type="button" onClick={() => { void load() }} className="app-button-primary">
          连接
        </button>
      </main>
    )
  }

  const active = job && ['starting', 'running'].includes(job.state)

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[760px] bg-[#191b1f] px-4 pb-10 pt-5 text-[var(--color-text)]">
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">MossStudio · LAN</div>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight">MossStudio</h1>
        </div>
        <span className="rounded-full border border-accent-500/30 bg-accent-500/10 px-2 py-1 text-[9px] text-accent-300">已连接桌面主机</span>
      </header>

      {error ? <div className="mt-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[11px] leading-5 text-red-300">{error}</div> : null}

      <section className="mt-4 space-y-3 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-3.5">
        <label className="block space-y-1">
          <span className="text-[10px] text-[var(--color-text-tertiary)]">实例</span>
          <select value={instanceId} onChange={(event) => setInstanceId(event.target.value)} className="app-input w-full">
            {bootstrap?.instances.length ? bootstrap.instances.map((instance) => (
              <option key={instance.id} value={instance.id}>{instance.name} · {instance.commit.slice(0, 7)}</option>
            )) : <option value="">桌面端还没有实例</option>}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-[10px] text-[var(--color-text-tertiary)]">提示词</span>
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={5} className="app-input w-full resize-y" placeholder="写下一个画面……" />
        </label>

        <label className="block space-y-1">
          <span className="text-[10px] text-[var(--color-text-tertiary)]">负向提示词</span>
          <input value={negative} onChange={(event) => setNegative(event.target.value)} className="app-input w-full" placeholder="可选" />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-[10px] text-[var(--color-text-tertiary)]">尺寸</span>
            <select
              value={`${width}x${height}`}
              onChange={(event) => {
                const [w, h] = event.target.value.split('x').map(Number)
                setWidth(w); setHeight(h)
              }}
              className="app-input w-full"
            >
              {SIZES.map(([label, w, h]) => <option key={label} value={`${w}x${h}`}>{label}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] text-[var(--color-text-tertiary)]">Seed</span>
            <input value={seed} onChange={(event) => setSeed(Number(event.target.value) || 0)} inputMode="numeric" className="app-input w-full" />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] text-[var(--color-text-tertiary)]">Steps</span>
            <input value={steps} onChange={(event) => setSteps(Number(event.target.value) || 1)} inputMode="numeric" className="app-input w-full" />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] text-[var(--color-text-tertiary)]">CFG</span>
            <input value={cfg} onChange={(event) => setCfg(Number(event.target.value) || 0)} inputMode="decimal" className="app-input w-full" />
          </label>
        </div>

        <button type="button" onClick={() => void generate()} disabled={busy || Boolean(active)} className="app-button-primary w-full disabled:opacity-50">
          {busy || active ? '生成中…' : '开始生成'}
        </button>
        <p className="text-[9.5px] leading-4 text-[var(--color-text-tertiary)]">
          画布编辑与 Project 全量同步在桌面版完成；手机端先覆盖提示词、生成与任务状态。
        </p>
      </section>

      {job ? (
        <section className="mt-4 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium">生成任务</span>
            <span className="text-[10px] text-[var(--color-text-tertiary)]">{job.state}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full bg-accent-500 transition-[width]" style={{ width: `${Math.max(0, Math.min(100, job.progress?.percent ?? 0))}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-[var(--color-text-tertiary)]">
            <span>{job.stage} · {job.progress?.current ?? 0}/{job.progress?.total ?? steps}</span>
            <span>{job.error?.message ?? ''}</span>
          </div>
        </section>
      ) : null}

      <section className="mt-4 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium">保存到 Project</span>
          <button type="button" onClick={() => void saveProject()} className="text-[10px] text-accent-300">保存</button>
        </div>
        <input value={projectName} onChange={(event) => setProjectName(event.target.value)} className="app-input mt-2 w-full" />
        <div className="mt-2 text-[10px] text-[var(--color-text-tertiary)]">
          {bootstrap?.projects.length ?? 0} 个桌面 Project；手机端保存为单画布草稿。
        </div>
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
