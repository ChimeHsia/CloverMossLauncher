import { RotateCcw, SlidersHorizontal } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { GradioLaunchConfig } from '@shared/types'
import {
  GRADIO_LISTEN_LABELS,
  GRADIO_LISTENS,
  GRADIO_OPEN_LABELS,
  GRADIO_OPEN_MODES,
  GRADIO_PROFILE_LABELS,
  GRADIO_PROFILES,
  createDefaultGradioConfig,
  gradioCommandPreview,
  normalizeGradioConfig,
} from '@shared/launch'
import { Button, Pill, Sheet, cn } from './ui'

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="border-b border-[var(--color-border-subtle)] py-4 first:pt-0 last:border-0 last:pb-0">
      <div className="mb-2.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-tertiary)]">
          {title}
        </h3>
        {hint ? <p className="mt-1 text-[10.5px] leading-4 text-[var(--color-text-tertiary)]">{hint}</p> : null}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <label className="block">
      <span className="mb-1 block text-[10.5px] text-[var(--color-text-secondary)]">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[9.5px] leading-4 text-[var(--color-text-tertiary)]">{hint}</span> : null}
    </label>
  )
}

const inputClass =
  'h-8 w-full rounded-[4px] border border-[var(--color-border-subtle)] bg-white/[0.04] px-2.5 text-[11px] outline-none transition focus:border-accent-500/60'

export function GradioSettingsSheet({
  open,
  value,
  remote = false,
  onClose,
  onApply,
}: {
  open: boolean
  value: GradioLaunchConfig
  remote?: boolean
  onClose: () => void
  onApply: (config: GradioLaunchConfig) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState<GradioLaunchConfig>(() => normalizeGradioConfig(value))

  useEffect(() => {
    if (open) setDraft(normalizeGradioConfig(value))
  }, [open, value])

  function update<K extends keyof GradioLaunchConfig>(key: K, next: GradioLaunchConfig[K]): void {
    setDraft((previous) => ({ ...previous, [key]: next }))
  }

  function updateText(key: 'model' | 'modelRoot' | 'outputDir' | 'promptDefaults' | 'extraArgs', text: string): void {
    const trimmed = text.trim()
    update(key, trimmed ? text : undefined)
  }

  const portError = draft.port !== null && (draft.port < 1024 || draft.port > 65535)
  const command = useMemo(() => gradioCommandPreview(draft), [draft])

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Gradio 启动参数"
      description="只把上游 gradio_app.py 支持的启动级参数写进启动命令；生成参数仍在官方 Gradio 页面里。"
      footer={
        <>
          <Button
            tone="ghost"
            className="mr-auto"
            onClick={() => setDraft(createDefaultGradioConfig())}
          >
            <span className="inline-flex items-center gap-1.5">
              <RotateCcw className="size-3.5" /> 恢复默认
            </span>
          </Button>
          <Button tone="secondary" onClick={onClose}>
            取消
          </Button>
          <Button
            tone="primary"
            disabled={portError}
            onClick={() => {
              onApply(normalizeGradioConfig(draft))
              onClose()
            }}
          >
            应用到启动条
          </Button>
        </>
      }
    >
      <div className="mb-4 flex items-start gap-2.5 rounded-[5px] border border-[var(--color-border-subtle)] bg-white/[0.025] px-3 py-2.5">
        <SlidersHorizontal className="mt-0.5 size-3.5 shrink-0 text-[var(--color-text-tertiary)]" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill tone="neutral">计算位置由「设备」决定</Pill>
            <Pill tone="neutral">不 Fork 上游</Pill>
          </div>
          <p className="mt-1.5 text-[10px] leading-4 text-[var(--color-text-tertiary)]">
            这里只改“怎么启动、开到哪里、监听哪里”。steps / CFG / 尺寸 / 显存模式 / SLG 由官方页面管理。
          </p>
        </div>
      </div>

      <Section title="模型" hint="留空则使用启动器默认的 SFT。模型路径在本机实例目录下解析。">
        <Field label="模型（HF ID 或本地目录）">
          <input
            value={draft.model ?? ''}
            onChange={(event) => updateText('model', event.target.value)}
            placeholder="OpenMOSS-Team/MOSS-Image-SFT（默认）"
            className={inputClass}
          />
        </Field>
        <Field label="模型根目录 --model-root">
          <input
            value={draft.modelRoot ?? ''}
            onChange={(event) => updateText('modelRoot', event.target.value)}
            placeholder="留空使用上游默认 .."
            className={inputClass}
          />
        </Field>
        <label className="flex items-start gap-2 text-[10.5px] leading-4 text-[var(--color-text-secondary)]">
          <input
            type="checkbox"
            checked={draft.localFilesOnly}
            onChange={(event) => update('localFilesOnly', event.target.checked)}
            className="mt-0.5 size-3.5 accent-[var(--color-accent-500)]"
          />
          <span>
            仅使用本地文件 / 已缓存文件
            <span className="mt-0.5 block text-[9.5px] text-[var(--color-text-tertiary)]">
              对应 --local-files-only；正式启动前仍会做权重预检。
            </span>
          </span>
        </label>
      </Section>

      <Section title="运行与输出">
        <div className="grid grid-cols-2 gap-2">
          <Field label="显存档位 --profile">
            <select
              value={draft.profile}
              onChange={(event) => update('profile', event.target.value as GradioLaunchConfig['profile'])}
              className={inputClass}
            >
              {GRADIO_PROFILES.map((profile) => (
                <option key={profile} value={profile}>
                  {GRADIO_PROFILE_LABELS[profile]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="端口">
            <input
              inputMode="numeric"
              value={draft.port ?? ''}
              onChange={(event) => {
                const digits = event.target.value.replace(/[^0-9]/g, '')
                update('port', digits ? Number(digits) : null)
              }}
              placeholder="自动选择"
              className={cn(inputClass, 'tabular-nums', portError && 'border-red-500/60')}
            />
          </Field>
        </div>
        {portError ? (
          <p className="-mt-1 text-[9.5px] text-red-300">端口需在 1024–65535，留空则自动选择。</p>
        ) : null}
        {remote ? (
          <p className="rounded-[4px] border border-sky-500/25 bg-sky-500/[0.06] px-2.5 py-2 text-[9.5px] leading-4 text-sky-200">
            远端实例：这里的端口是远端 Gradio 端口；本地 SSH 隧道端口自动分配。监听范围作用在远端。
          </p>
        ) : null}
        <Field label="输出目录 --output-dir">
          <input
            value={draft.outputDir ?? ''}
            onChange={(event) => updateText('outputDir', event.target.value)}
            placeholder="outputs/gradio（默认）"
            className={inputClass}
          />
        </Field>
        <Field label="提示词默认值 --prompt-defaults" hint="格式沿用上游 assets/prompt_defaults.txt。留空使用上游默认文件。">
          <input
            value={draft.promptDefaults ?? ''}
            onChange={(event) => updateText('promptDefaults', event.target.value)}
            placeholder="留空使用上游默认文件"
            className={inputClass}
          />
        </Field>
      </Section>

      <Section title="打开方式与监听" hint="计算位置不在这里改；它由 Instance 的部署位置和启动条设备决定。">
        <div className="grid grid-cols-2 gap-2">
          <Field label="界面打开位置">
            <select
              value={draft.openMode}
              onChange={(event) => update('openMode', event.target.value as GradioLaunchConfig['openMode'])}
              className={inputClass}
            >
              {GRADIO_OPEN_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {GRADIO_OPEN_LABELS[mode]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="服务监听范围">
            <select
              value={draft.listen}
              onChange={(event) => update('listen', event.target.value as GradioLaunchConfig['listen'])}
              className={inputClass}
            >
              {GRADIO_LISTENS.map((listen) => (
                <option key={listen} value={listen}>
                  {GRADIO_LISTEN_LABELS[listen]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {draft.listen === 'lan' ? (
          <p className="rounded-[4px] border border-amber-500/25 bg-amber-500/[0.07] px-2.5 py-2 text-[9.5px] leading-4 text-amber-200">
            官方 Gradio 没有内置认证。监听局域网会让同一网络中的其他人访问这个服务；只在你明确需要时开启。
          </p>
        ) : null}
        <p className="text-[9.5px] leading-4 text-[var(--color-text-tertiary)]">
          就绪后会自动按「界面打开位置」打开；运行中的 Case 也可以随时从任务表重新打开。
        </p>
      </Section>

      <Section title="高级">
        <Field label="额外参数" hint="按空格拆分，支持引号包裹带空格的路径。只透传，不校验上游是否认识。">
          <input
            value={draft.extraArgs ?? ''}
            onChange={(event) => updateText('extraArgs', event.target.value)}
            placeholder='例如：--share（请确认上游支持）'
            className={cn(inputClass, 'font-mono text-[10px]')}
          />
        </Field>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10.5px] text-[var(--color-text-secondary)]">实际命令预览</span>
            <span className="text-[9.5px] text-[var(--color-text-tertiary)]">端口未指定时显示「自动」</span>
          </div>
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-[4px] border border-[var(--color-border-subtle)] bg-black/25 px-2.5 py-2 font-mono text-[9.5px] leading-4 text-[var(--color-text-secondary)]">
            {command}
          </pre>
        </div>
      </Section>
    </Sheet>
  )
}
