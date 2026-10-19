import {
  ArrowRight,
  Box,
  Copy,
  Eraser,
  ImagePlus,
  Layers,
  MousePointer2,
  Sparkles,
  SquareDashedMousePointer,
  Type,
  UserRound,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { GalleryItem, InstanceInfo } from '@shared/types'
import { cloverUrl } from '../lib/clover'
import {
  clampBox,
  compileLayout,
  createDraft,
  exampleDraft,
  type CompileResult,
  type LayoutDraft,
  type LayoutLabel,
} from '../lib/layout'
import { useApp } from '../store'
import { Button, Card, Modal, Pill, Segmented, cn, useToast } from '../components/ui'

const SIZE_PRESETS: Array<[string, number, number]> = [
  ['512²', 512, 512],
  ['768²', 768, 768],
  ['1024²', 1024, 1024],
  ['1024×768', 1024, 768],
  ['768×1024', 768, 1024],
]

const LABEL_META: Record<LayoutLabel, { name: string; color: string; icon: React.ReactNode }> = {
  object: { name: '物体', color: 'accent', icon: <Box className="size-3" /> },
  character: { name: '人物', color: 'sky', icon: <UserRound className="size-3" /> },
  text: { name: '文字', color: 'amber', icon: <Type className="size-3" /> },
}

type DragState =
  | { kind: 'move' | 'resize'; id: string; startX: number; startY: number; origin: [number, number, number, number] }
  | null

export function StudioPage(): React.JSX.Element {
  const toast = useToast()
  const storedPrompt = useApp((state) => state.studioPrompt)
  const storedDraft = useApp((state) => state.studioDraft)
  const background = useApp((state) => state.studioBackground)
  const setStudioPrompt = useApp((state) => state.setStudioPrompt)
  const setStudioBackground = useApp((state) => state.setStudioBackground)
  const instances = useApp((state) => state.instances)
  const env = useApp((state) => state.env)

  const [prompt, setPrompt] = useState(storedPrompt)
  const [negative, setNegative] = useState('nsfw, worst quality, bad anatomy, watermark, jpeg artifact')
  const [draft, setDraft] = useState<LayoutDraft>(storedDraft ?? exampleDraft())
  const [tool, setTool] = useState<'select' | 'draw'>('draw')
  const [label, setLabel] = useState<LayoutLabel>('object')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drawing, setDrawing] = useState<{ start: [number, number]; current: [number, number] } | null>(null)
  const [drag, setDrag] = useState<DragState>(null)
  const [compiled, setCompiled] = useState<CompileResult | null>(null)
  const [jsonOpen, setJsonOpen] = useState(false)
  const [steps, setSteps] = useState(env?.recommendation.steps ?? 8)
  const [cfg, setCfg] = useState(env?.recommendation.profile === 'dmd8' ? 1 : 3)
  const [seed, setSeed] = useState(42)
  const [instanceId, setInstanceId] = useState(instances[0]?.id ?? '')
  const canvasRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (storedPrompt) setPrompt(storedPrompt)
  }, [storedPrompt])

  useEffect(() => {
    if (storedDraft) setDraft(storedDraft)
  }, [storedDraft])

  const selected = draft.items.find((item) => item.id === selectedId) ?? null

  function toDraftPoint(event: React.PointerEvent): [number, number] {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return [0, 0]
    return [
      Math.round(((event.clientX - rect.left) / rect.width) * draft.width),
      Math.round(((event.clientY - rect.top) / rect.height) * draft.height),
    ]
  }

  function handlePointerDown(event: React.PointerEvent): void {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    const resizeId = target.dataset.resizeId
    const boxId = target.closest<HTMLElement>('[data-box-id]')?.dataset.boxId
    canvasRef.current?.setPointerCapture(event.pointerId)
    const [x, y] = toDraftPoint(event)

    if (resizeId) {
      const item = draft.items.find((entry) => entry.id === resizeId)
      if (item) {
        setSelectedId(item.id)
        setDrag({ kind: 'resize', id: item.id, startX: x, startY: y, origin: [...item.bbox] })
      }
      return
    }
    if (boxId) {
      const item = draft.items.find((entry) => entry.id === boxId)
      if (item) {
        setSelectedId(item.id)
        setDrag({ kind: 'move', id: item.id, startX: x, startY: y, origin: [...item.bbox] })
      }
      return
    }
    setSelectedId(null)
    if (tool === 'draw') {
      const point: [number, number] = [x, y]
      setDrawing({ start: point, current: point })
    }
  }

  function updateItem(id: string, bbox: [number, number, number, number]): void {
    setDraft((previous) => ({
      ...previous,
      items: previous.items.map((item) => (item.id === id ? { ...item, bbox } : item)),
    }))
  }

  function handlePointerMove(event: React.PointerEvent): void {
    if (!drawing && !drag) return
    const [x, y] = toDraftPoint(event)
    if (drawing) {
      setDrawing({ start: drawing.start, current: [x, y] })
      return
    }
    if (drag) {
      const dx = x - drag.startX
      const dy = y - drag.startY
      const [x1, y1, x2, y2] = drag.origin
      if (drag.kind === 'move') {
        const width = x2 - x1
        const height = y2 - y1
        const left = Math.max(0, Math.min(draft.width - width, x1 + dx))
        const top = Math.max(0, Math.min(draft.height - height, y1 + dy))
        updateItem(drag.id, [left, top, left + width, top + height])
      } else {
        updateItem(drag.id, [
          x1,
          y1,
          Math.max(x1 + 8, Math.min(draft.width, x2 + dx)),
          Math.max(y1 + 8, Math.min(draft.height, y2 + dy)),
        ])
      }
    }
  }

  function handlePointerUp(): void {
    if (drawing) {
      const [x1, y1] = drawing.start
      const [x2, y2] = drawing.current
      const box = clampBox([Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)], draft.width, draft.height)
      if (box[2] - box[0] >= 12 && box[3] - box[1] >= 12) {
        const item = {
          id: crypto.randomUUID(),
          label,
          caption: '',
          text: label === 'text' ? '' : undefined,
          bbox: box,
        }
        setDraft((previous) => ({ ...previous, items: [...previous.items, item] }))
        setSelectedId(item.id)
        setTool('select')
      }
      setDrawing(null)
    }
    setDrag(null)
  }

  function changeSize(width: number, height: number): void {
    setDraft((previous) => ({
      ...previous,
      width,
      height,
      items: previous.items.map((item) => ({ ...item, bbox: clampBox(item.bbox, width, height) })),
    }))
  }

  function setItem(id: string, patch: Partial<LayoutDraft['items'][number]>): void {
    setDraft((previous) => ({
      ...previous,
      items: previous.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }))
  }

  function removeItem(id: string): void {
    setDraft((previous) => ({ ...previous, items: previous.items.filter((item) => item.id !== id) }))
    if (selectedId === id) setSelectedId(null)
  }

  function compile(): void {
    const result = compileLayout(draft)
    if (!result.ok) {
      toast.push(result.errors[0] ?? '布局不完整', 'error')
      return
    }
    setCompiled(result)
    setJsonOpen(true)
  }

  function insertPrompt(): void {
    if (!compiled || !compiled.ok) return
    const next = prompt.trim() ? `${prompt.trim()}\n\n${compiled.prompt}` : compiled.prompt
    setPrompt(next)
    setStudioPrompt(next)
    setJsonOpen(false)
    toast.push('布局 Prompt 已插入', 'success')
  }

  function generate(): void {
    toast.push('运行后端将在 M4 接入。当前可以先编译布局 Prompt 并保存。', 'info')
  }

  return (
    <div className="space-y-4 pb-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">创作</h1>
          <p className="mt-1 text-[12px] text-[var(--color-text-secondary)]">
            写提示词、框选布局，再编译成 MOSS 的 layout JSON。运行接入在 M4。
          </p>
        </div>
        <div className="flex items-center gap-2">
          {env ? <Pill tone="blue">{env.recommendation.width}² · {env.recommendation.steps} 步</Pill> : null}
          <Button tone="primary" onClick={generate}>
            <span className="inline-flex items-center gap-1.5">
              开始生成 <ArrowRight className="size-3.5" />
            </span>
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-semibold">提示词</h2>
              <span className="text-[10px] text-[var(--color-text-tertiary)]">{prompt.length} 字符</span>
            </div>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="描述画面、文字、风格与布局。也可以粘贴编译后的 layout JSON。"
              className="mt-2.5 h-40 w-full resize-none rounded-xl border border-[var(--color-border)] bg-white/55 px-3 py-2.5 text-[12px] leading-5 outline-none transition focus:border-accent-500 dark:bg-white/[0.04]"
            />
            <label className="mt-3 block text-[10.5px] text-[var(--color-text-tertiary)]">负面提示词</label>
            <input
              value={negative}
              onChange={(event) => setNegative(event.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-white/55 px-2.5 py-1.5 text-[11px] outline-none focus:border-accent-500 dark:bg-white/[0.04]"
            />
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Button
                tone="secondary"
                onClick={() => {
                  setDraft(exampleDraft())
                  setSelectedId(null)
                }}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles className="size-3.5" /> 示例布局
                </span>
              </Button>
              <Button
                tone="ghost"
                onClick={() => {
                  setDraft(createDraft(draft.width, draft.height))
                  setSelectedId(null)
                }}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Eraser className="size-3.5" /> 清空画布
                </span>
              </Button>
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="text-[13px] font-semibold">画布与采样</h2>
            <div className="mt-3 flex flex-wrap gap-1">
              {SIZE_PRESETS.map(([name, width, height]) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => changeSize(width, height)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[10.5px] transition',
                    draft.width === width && draft.height === height
                      ? 'border-accent-500/40 bg-accent-500/12 text-accent-700 dark:text-accent-200'
                      : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-accent-400/40',
                  )}
                >
                  {name}
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[10px] text-[var(--color-text-tertiary)]">宽度（16 倍数）</span>
                <input
                  type="number"
                  min={256}
                  max={2048}
                  step={16}
                  value={draft.width}
                  onChange={(event) => changeSize(Number(event.target.value) || draft.width, draft.height)}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-white/55 px-2.5 py-1.5 text-[11px] outline-none focus:border-accent-500 dark:bg-white/[0.04]"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] text-[var(--color-text-tertiary)]">高度（16 倍数）</span>
                <input
                  type="number"
                  min={256}
                  max={2048}
                  step={16}
                  value={draft.height}
                  onChange={(event) => changeSize(draft.width, Number(event.target.value) || draft.height)}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-white/55 px-2.5 py-1.5 text-[11px] outline-none focus:border-accent-500 dark:bg-white/[0.04]"
                />
              </label>
            </div>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] text-[var(--color-text-secondary)]">步数</span>
                <Segmented
                  value={String(steps)}
                  onChange={(value) => setSteps(Number(value))}
                  options={[
                    { value: '8', label: '8 DMD' },
                    { value: '20', label: '20' },
                    { value: '50', label: '50' },
                  ]}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-[10px] text-[var(--color-text-tertiary)]">CFG</span>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    step={0.5}
                    value={cfg}
                    onChange={(event) => setCfg(Number(event.target.value))}
                    className="w-full rounded-lg border border-[var(--color-border)] bg-white/55 px-2.5 py-1.5 text-[11px] outline-none focus:border-accent-500 dark:bg-white/[0.04]"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] text-[var(--color-text-tertiary)]">Seed</span>
                  <input
                    type="number"
                    value={seed}
                    onChange={(event) => setSeed(Number(event.target.value))}
                    className="w-full rounded-lg border border-[var(--color-border)] bg-white/55 px-2.5 py-1.5 text-[11px] outline-none focus:border-accent-500 dark:bg-white/[0.04]"
                  />
                </label>
              </div>
              <label className="block space-y-1">
                <span className="text-[10px] text-[var(--color-text-tertiary)]">实例</span>
                <select
                  value={instanceId}
                  onChange={(event) => setInstanceId(event.target.value)}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-white/55 px-2.5 py-1.5 text-[11px] outline-none focus:border-accent-500 dark:bg-white/[0.04]"
                >
                  {instances.length === 0 ? <option value="">尚未创建实例</option> : null}
                  {instances.map((instance: InstanceInfo) => (
                    <option key={instance.id} value={instance.id}>
                      {instance.name} · {instance.runtimeState === 'ready' ? '就绪' : '未装依赖'}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border-subtle)] px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Layers className="size-3.5 text-accent-500" />
                <span className="text-[12.5px] font-medium">布局画布</span>
                <span className="text-[10px] text-[var(--color-text-tertiary)]">
                  {draft.width} × {draft.height} · {draft.items.length} 个区域
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Segmented
                  value={tool}
                  onChange={(value) => setTool(value as 'select' | 'draw')}
                  options={[
                    { value: 'select', label: '选择' },
                    { value: 'draw', label: '画框' },
                  ]}
                />
                <Segmented
                  value={label}
                  onChange={(value) => setLabel(value as LayoutLabel)}
                  options={[
                    { value: 'object', label: '物体' },
                    { value: 'character', label: '人物' },
                    { value: 'text', label: '文字' },
                  ]}
                />
                {background ? (
                  <Button tone="ghost" onClick={() => setStudioBackground(null)}>
                    <X className="size-3.5" />
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="p-3">
              <div
                ref={canvasRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className={cn(
                  'relative w-full select-none overflow-hidden rounded-lg border border-[var(--color-border)]',
                  tool === 'draw' ? 'cursor-crosshair' : 'cursor-default',
                )}
                style={{ aspectRatio: `${draft.width} / ${draft.height}` }}
              >
                {background ? (
                  <img
                    src={cloverUrl(background.path)}
                    alt={background.name}
                    className="absolute inset-0 size-full object-contain"
                    draggable={false}
                  />
                ) : (
                  <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(148,163,184,0.10)_25%,transparent_25%,transparent_75%,rgba(148,163,184,0.10)_75%),linear-gradient(45deg,rgba(148,163,184,0.10)_25%,transparent_25%,transparent_75%,rgba(148,163,184,0.10)_75%)] bg-[length:24px_24px] bg-[position:0_0,12px_12px]" />
                )}
                <div className="absolute inset-0 bg-gradient-to-br from-accent-500/[0.03] to-transparent" />

                {draft.items.map((item, index) => {
                  const [x1, y1, x2, y2] = item.bbox
                  const isSelected = item.id === selectedId
                  const meta = LABEL_META[item.label]
                  return (
                    <div
                      key={item.id}
                      data-box-id={item.id}
                      className={cn(
                        'absolute cursor-move rounded-[4px] border-2 transition-colors',
                        isSelected
                          ? 'border-accent-400 bg-accent-400/15'
                          : 'border-sky-400/80 bg-sky-400/10 hover:border-accent-400',
                      )}
                      style={{
                        left: `${(x1 / draft.width) * 100}%`,
                        top: `${(y1 / draft.height) * 100}%`,
                        width: `${((x2 - x1) / draft.width) * 100}%`,
                        height: `${((y2 - y1) / draft.height) * 100}%`,
                      }}
                    >
                      <span className="absolute -top-5 left-0 inline-flex max-w-full items-center gap-1 truncate rounded bg-accent-600 px-1.5 py-0.5 text-[9px] font-medium text-white">
                        {index + 1} · {meta.name}
                        {item.label === 'text' && item.text ? ` · ${item.text.slice(0, 10)}` : ''}
                      </span>
                      {isSelected ? (
                        <span
                          data-resize-id={item.id}
                          className="absolute -bottom-1.5 -right-1.5 size-3 cursor-nwse-resize rounded-full border-2 border-white bg-accent-500 shadow"
                        />
                      ) : null}
                    </div>
                  )
                })}

                {drawing ? (
                  <div
                    className="pointer-events-none absolute rounded-[4px] border-2 border-dashed border-accent-400 bg-accent-400/15"
                    style={{
                      left: `${(Math.min(drawing.start[0], drawing.current[0]) / draft.width) * 100}%`,
                      top: `${(Math.min(drawing.start[1], drawing.current[1]) / draft.height) * 100}%`,
                      width: `${(Math.abs(drawing.current[0] - drawing.start[0]) / draft.width) * 100}%`,
                      height: `${(Math.abs(drawing.current[1] - drawing.start[1]) / draft.height) * 100}%`,
                    }}
                  />
                ) : null}
              </div>
              <p className="mt-2 text-[10px] text-[var(--color-text-tertiary)]">
                拖拽空白处画框；点击框选中，拖动移动，右下角圆点缩放。文字区域需要填写显示内容。
              </p>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-semibold">区域</h2>
              <Button tone="ghost" onClick={() => setSelectedId(null)}>
                <span className="inline-flex items-center gap-1.5">
                  <MousePointer2 className="size-3.5" /> 取消选择
                </span>
              </Button>
            </div>
            <div className="mt-2 space-y-2">
              {draft.items.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--color-border)] px-3 py-6 text-center text-[11px] text-[var(--color-text-tertiary)]">
                  还没有区域。用“画框”在画布上拖出一个矩形。
                </div>
              ) : (
                draft.items.map((item, index) => (
                  <div
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className={cn(
                      'rounded-xl border px-2.5 py-2 transition',
                      item.id === selectedId
                        ? 'border-accent-400/60 bg-accent-500/[0.06]'
                        : 'border-[var(--color-border-subtle)] bg-white/35 dark:bg-white/[0.03]',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="inline-flex size-5 items-center justify-center rounded-md bg-accent-500/12 text-[10px] font-semibold text-accent-700 dark:text-accent-200">
                        {index + 1}
                      </span>
                      <select
                        value={item.label}
                        onChange={(event) => setItem(item.id, { label: event.target.value as LayoutLabel })}
                        className="rounded-md border border-[var(--color-border)] bg-transparent px-1 py-0.5 text-[10.5px] outline-none"
                      >
                        <option value="object">物体</option>
                        <option value="character">人物</option>
                        <option value="text">文字</option>
                      </select>
                      <span className="ml-auto font-mono text-[9.5px] text-[var(--color-text-tertiary)]">
                        {item.bbox.map((value) => Math.round(value)).join(', ')}
                      </span>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          removeItem(item.id)
                        }}
                        className="text-[var(--color-text-tertiary)] hover:text-red-500"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                    <input
                      value={item.caption}
                      onChange={(event) => setItem(item.id, { caption: event.target.value })}
                      placeholder="描述这个区域的外观、材质、动作…"
                      className="mt-1.5 w-full rounded-md border border-[var(--color-border)] bg-white/45 px-2 py-1 text-[10.5px] outline-none focus:border-accent-500 dark:bg-white/[0.03]"
                    />
                    {item.label === 'text' ? (
                      <input
                        value={item.text ?? ''}
                        onChange={(event) => setItem(item.id, { text: event.target.value })}
                        placeholder="要渲染的文字，可包含换行"
                        className="mt-1 w-full rounded-md border border-amber-500/30 bg-amber-500/[0.05] px-2 py-1 text-[10.5px] outline-none focus:border-amber-500"
                      />
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-semibold">布局总览</h2>
              <Pill tone="neutral">abs · xyxy</Pill>
            </div>
            <label className="mt-2 block space-y-1">
              <span className="text-[10px] text-[var(--color-text-tertiary)]">整体描述（summary.caption）</span>
              <textarea
                value={draft.summary.caption}
                onChange={(event) =>
                  setDraft((previous) => ({
                    ...previous,
                    summary: { ...previous.summary, caption: event.target.value },
                  }))
                }
                placeholder="一句话描述整张图的场景、风格与构图。"
                className="h-20 w-full resize-none rounded-lg border border-[var(--color-border)] bg-white/55 px-2.5 py-2 text-[11px] outline-none focus:border-accent-500 dark:bg-white/[0.04]"
              />
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[10px] text-[var(--color-text-tertiary)]">meta（逗号分隔）</span>
                <input
                  value={draft.summary.meta.join(', ')}
                  onChange={(event) =>
                    setDraft((previous) => ({
                      ...previous,
                      summary: {
                        ...previous.summary,
                        meta: event.target.value
                          .split(',')
                          .map((value) => value.trim())
                          .filter(Boolean),
                      },
                    }))
                  }
                  placeholder="poster, typography"
                  className="w-full rounded-lg border border-[var(--color-border)] bg-white/55 px-2.5 py-1.5 text-[10.5px] outline-none focus:border-accent-500 dark:bg-white/[0.04]"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] text-[var(--color-text-tertiary)]">canvas</span>
                <select
                  value={draft.summary.canvas}
                  onChange={(event) =>
                    setDraft((previous) => ({
                      ...previous,
                      summary: {
                        ...previous.summary,
                        canvas: event.target.value as LayoutDraft['summary']['canvas'],
                      },
                    }))
                  }
                  className="w-full rounded-lg border border-[var(--color-border)] bg-white/55 px-2.5 py-1.5 text-[10.5px] outline-none focus:border-accent-500 dark:bg-white/[0.04]"
                >
                  <option value="single">single</option>
                  <option value="multi_panel">multi_panel</option>
                  <option value="collage">collage</option>
                </select>
              </label>
            </div>
            <Button tone="primary" className="mt-3 w-full" onClick={compile}>
              <span className="inline-flex items-center gap-1.5">
                <SquareDashedMousePointer className="size-3.5" /> 编译布局 Prompt
              </span>
            </Button>
            <p className="mt-2 text-[9.5px] leading-4 text-[var(--color-text-tertiary)]">
              编译会按官方规则转换为中心原点 + yxyx，并校验画布、区域与文字；失败时会指出具体区域。
            </p>
          </Card>
        </div>
      </div>

      <Modal
        open={jsonOpen}
        onClose={() => setJsonOpen(false)}
        title="编译后的布局 Prompt"
        description="模型需要的 abs_centralized + yxyx 格式，可直接粘贴到 Prompt 输入框。"
        width="max-w-3xl"
        footer={
          <>
            <Button tone="ghost" onClick={() => setJsonOpen(false)}>
              取消
            </Button>
            <Button
              tone="secondary"
              onClick={() => {
                if (!compiled) return
                void navigator.clipboard.writeText(compiled.prompt)
                toast.push('已复制 JSON', 'success')
              }}
            >
              <span className="inline-flex items-center gap-1.5">
                <Copy className="size-3.5" /> 复制
              </span>
            </Button>
            <Button tone="primary" onClick={insertPrompt}>
              插入到 Prompt
            </Button>
          </>
        }
      >
        <pre className="max-h-[46vh] overflow-auto rounded-xl bg-white/55 p-3 font-mono text-[10.5px] leading-5 dark:bg-black/30">
          {compiled?.preview ?? ''}
        </pre>
        {compiled?.errors.length ? (
          <div className="mt-2 text-[11px] text-red-500">{compiled.errors.join('；')}</div>
        ) : null}
      </Modal>
    </div>
  )
}
