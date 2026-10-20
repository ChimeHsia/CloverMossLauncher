import { Download, Layers, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Ipc } from '@shared/channels'
import type { InstanceInfo, ModelBinding } from '@shared/types'
import { call } from '../lib/api'
import { useApp } from '../store'
import { Button, Spinner, useToast } from './ui'

export function ModelBindingEditor({ instance }: { instance: InstanceInfo }): React.JSX.Element {
  const catalog = useApp((s) => s.catalog)
  const refreshInstances = useApp((s) => s.refreshInstances)
  const downloadModel = useApp((s) => s.downloadModel)
  const [draft, setDraft] = useState<ModelBinding | null>(instance.modelBinding ?? null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  useEffect(() => {
    setDraft(instance.modelBinding ?? null)
  }, [instance.id, instance.modelBinding])
  if (instance.placement.kind === 'ssh')
    return (
      <p className="mt-3 text-[12px] leading-5 text-[var(--color-text-secondary)]">
        远端实例继续使用 Gradio 启动参数中的模型配置。本次组件绑定仅适用于本地实例。
      </p>
    )
  const bundle = catalog?.bundles?.find((b) => b.id === draft?.bundleId)
  const ids = draft
    ? [draft.dit, draft.textEncoder, draft.vae, bundle?.support].filter((id): id is string =>
        Boolean(id),
      )
    : []
  const missing = ids.filter((id) => !catalog?.models.find((m) => m.id === id)?.installed)
  async function save(): Promise<void> {
    setBusy(true)
    try {
      await call(Ipc.instanceModelBinding, { id: instance.id, binding: draft })
      await refreshInstances()
      toast.push('模型绑定已保存', 'success')
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setBusy(false)
    }
  }
  async function install(): Promise<void> {
    setBusy(true)
    try {
      for (const id of missing) await downloadModel(id)
      toast.push('缺失组件已加入下载队列', 'success')
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="mt-3 space-y-3">
      <label className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-1.5 text-[12px] text-[var(--color-text-secondary)]">
          <Layers className="size-3.5" />
          模型组合
        </span>
        <select
          aria-label="实例模型组合"
          className="model-select min-w-48 flex-1"
          value={draft?.bundleId ?? ''}
          onChange={(e) => {
            const selected = catalog?.bundles?.find((b) => b.id === e.target.value)
            setDraft(selected ? { bundleId: selected.id, ...selected.components } : null)
          }}
        >
          <option value="">未绑定 · 沿用原模型配置</option>
          {catalog?.bundles?.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      {draft ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {(
            [
              ['dit', '主模型', 'dit'],
              ['textEncoder', '文本编码器', 'text_encoder'],
              ['vae', 'VAE', 'vae'],
            ] as const
          ).map(([key, label, role]) => {
            const selected = catalog?.models.find((m) => m.id === draft[key])
            return (
              <label
                key={key}
                className="min-w-0 rounded-[6px] border border-[var(--color-border-subtle)] p-3"
              >
                <span className="flex justify-between text-[11px] text-[var(--color-text-secondary)]">
                  {label}
                  <span
                    className={
                      selected?.installed ? 'text-accent-400' : 'text-[var(--color-text-tertiary)]'
                    }
                  >
                    {selected?.installed ? '已就绪' : '待补齐'}
                  </span>
                </span>
                <select
                  aria-label={`绑定${label}`}
                  value={draft[key]}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                  className="model-select mt-2 w-full !text-[11px]"
                >
                  {!selected ? <option value={draft[key]}>组件已不在目录中</option> : null}
                  {catalog?.models
                    .filter(
                      (m) =>
                        m.role === role && m.format === 'diffusers' && m.family === 'moss-image',
                    )
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} · {m.precision.toUpperCase()}
                      </option>
                    ))}
                </select>
              </label>
            )
          })}
        </div>
      ) : (
        <p className="text-[12px] leading-5 text-[var(--color-text-secondary)]">
          选择组合后可独立切换主模型，并复用已下载的编码器与 VAE。
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] leading-5 text-[var(--color-text-tertiary)]">
          {draft
            ? missing.length
              ? `还缺 ${missing.length} 项组件，补齐后可启动。`
              : '组件已就绪，将按各组件的精度加载。'
            : '自定义 Gradio 模型配置优先于实例绑定。'}
        </p>
        <div className="flex gap-2">
          {draft && missing.length ? (
            <Button tone="secondary" disabled={busy} onClick={() => void install()}>
              <Download className="size-3.5" />
              补齐组件
            </Button>
          ) : null}
          <Button tone="primary" disabled={busy} onClick={() => void save()}>
            {busy ? <Spinner className="size-3.5" /> : <Save className="size-3.5" />}保存绑定
          </Button>
        </div>
      </div>
    </div>
  )
}
