import {
  ArrowRight,
  BookOpen,
  Boxes,
  ChevronRight,
  Image as ImageIcon,
  LayoutGrid,
  Sparkles,
  Type,
  UserRound,
  Wand2,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Ipc } from '@shared/channels'
import type { GalleryItem, GalleryPage } from '@shared/types'
import { call } from '../lib/api'
import { cloverUrl } from '../lib/clover'
import { relative } from '../lib/format'
import { exampleDraft, type LayoutDraft } from '../lib/layout'
import { useApp } from '../store'
import { Button, Card, EmptyState, Pill, StatusDot, cn } from '../components/ui'

interface Tutorial {
  id: string
  title: string
  description: string
  tag: 'Layout' | 'Prompt'
  icon: React.ReactNode
  prompt: string
  draft: LayoutDraft | null
}

const characterDraft: LayoutDraft = {
  width: 1024,
  height: 1024,
  summary: {
    caption:
      'An anime-style illustration of a girl in a navy school uniform standing in a sunlit classroom, with rows of wooden desks and large windows.',
    meta: ['illustration', 'anime'],
    canvas: 'single',
  },
  items: [
    {
      id: 'character-1',
      label: 'character',
      caption:
        'A girl with shoulder-length dark hair, navy sailor uniform and a red ribbon, standing and looking toward the camera, soft rim light.',
      bbox: [352, 192, 672, 896],
    },
    {
      id: 'background-1',
      label: 'object',
      caption:
        'A sunlit Japanese classroom: rows of wooden desks, a large blackboard, large windows with white curtains and warm afternoon light.',
      bbox: [0, 0, 1024, 1024],
    },
  ],
}

const tutorials: Tutorial[] = [
  {
    id: 'poster',
    title: '海报排版：标题 + 副标题',
    description: '用两个文字框分别控制标题与正文的位置、字号和颜色。',
    tag: 'Layout',
    icon: <LayoutGrid className="size-4" />,
    prompt: 'A minimalist travel poster with a cream background and a blue mountain illustration.',
    draft: exampleDraft(),
  },
  {
    id: 'character',
    title: '人物构图：人物 + 背景',
    description: '把人物与场景拆成两个区域，各自描述外观与光线。',
    tag: 'Layout',
    icon: <UserRound className="size-4" />,
    prompt: 'An anime-style illustration of a girl standing in a sunlit classroom.',
    draft: characterDraft,
  },
  {
    id: 'text',
    title: '文字渲染：招牌与营业时间',
    description: '把要显示的文字原样写进 prompt，用引号和换行控制排版。',
    tag: 'Prompt',
    icon: <Type className="size-4" />,
    prompt:
      'A cozy ramen shop at night. A wooden sign above the door reads "麺" in warm white neon; a small chalkboard says "営業中\n18:00 - 02:00".',
    draft: null,
  },
]

export function HomePage(): React.JSX.Element {
  const navigate = useNavigate()
  const env = useApp((state) => state.env)
  const instances = useApp((state) => state.instances)
  const settings = useApp((state) => state.settings)
  const updates = useApp((state) => state.updates)
  const setStudioPrompt = useApp((state) => state.setStudioPrompt)
  const setStudioDraft = useApp((state) => state.setStudioDraft)
  const [heroPrompt, setHeroPrompt] = useState('')
  const [recent, setRecent] = useState<GalleryItem[]>([])

  useEffect(() => {
    let cancelled = false
    void call<GalleryPage>(Ipc.galleryList, { limit: 4 })
      .then((page) => {
        if (!cancelled) setRecent(page.items)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  function startStudio(prompt: string, draft: LayoutDraft | null = null): void {
    setStudioPrompt(prompt)
    setStudioDraft(draft)
    navigate('/studio')
  }

  function startTutorial(tutorial: Tutorial): void {
    startStudio(tutorial.prompt, tutorial.draft)
  }

  const background = settings?.homeBackground

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-[22px] border border-[var(--color-border-subtle)] shadow-[0_18px_50px_-24px_rgba(37,99,235,0.35)]">
        {background ? (
          <img
            src={cloverUrl(background)}
            alt=""
            className="absolute inset-0 size-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(900px_420px_at_10%_-10%,#dbeafe_0%,transparent_60%),radial-gradient(700px_400px_at_100%_120%,#e0ecff_0%,transparent_58%),linear-gradient(135deg,#f8fbff_0%,#eef5ff_60%,#f7faff_100%)] dark:bg-[radial-gradient(900px_420px_at_10%_-10%,#17305a_0%,transparent_60%),radial-gradient(700px_400px_at_100%_120%,#112240_0%,transparent_58%),linear-gradient(135deg,#070c15_0%,#0b1424_60%,#070c15_100%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-white/90 via-white/70 to-white/20 dark:from-[#070c15]/92 dark:via-[#070c15]/72 dark:to-transparent" />

        <div className="relative z-10 px-7 py-7">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="blue">
              <Sparkles className="size-3" /> CloverMoss · MOSS-Image
            </Pill>
            {updates?.updateAvailable ? <Pill tone="blue">v{updates.latestVersion} 可用</Pill> : null}
            {env ? (
              <Pill tone="neutral">
                {env.gpu.name} · {Math.round(env.device.memoryTotal / 1024 ** 3)} GB
              </Pill>
            ) : null}
          </div>

          <h1 className="mt-4 max-w-[560px] text-[30px] font-semibold leading-[1.2] tracking-tight">
            今天想在 Moss 中
            <span className="text-accent-600 dark:text-accent-300">画点什么？</span>
          </h1>
          <p className="mt-2 max-w-[540px] text-[12.5px] leading-6 text-[var(--color-text-secondary)]">
            写一个画面、一段文字排版，或者用框选把人物和标题放到准确的位置。
          </p>

          <div className="mt-4 flex max-w-[560px] items-end gap-2 rounded-2xl border border-white/70 bg-white/70 p-2 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06]">
            <textarea
              value={heroPrompt}
              onChange={(event) => setHeroPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  startStudio(heroPrompt)
                }
              }}
              rows={2}
              placeholder="例如：雨夜修表店，橱窗里有一只猫，招牌写着 REPAIR…"
              className="min-h-[48px] min-w-0 flex-1 resize-none bg-transparent px-2 py-1 text-[12.5px] leading-5 outline-none placeholder:text-[var(--color-text-tertiary)]"
            />
            <Button tone="primary" className="shrink-0" onClick={() => startStudio(heroPrompt)}>
              <span className="inline-flex items-center gap-1.5">
                进入创作 <ArrowRight className="size-3.5" />
              </span>
            </Button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[10.5px] text-[var(--color-text-tertiary)]">试试：</span>
            {tutorials.map((tutorial) => (
              <button
                key={tutorial.id}
                type="button"
                onClick={() => startTutorial(tutorial)}
                className="rounded-full border border-white/70 bg-white/55 px-2.5 py-1 text-[10.5px] text-[var(--color-text-secondary)] backdrop-blur-md transition hover:border-accent-400/50 hover:text-accent-700 dark:border-white/10 dark:bg-white/[0.05] dark:hover:text-accent-200"
              >
                {tutorial.title.split('：')[0]}
              </button>
            ))}
            {env ? (
              <span className="ml-auto text-[10.5px] text-[var(--color-text-tertiary)]">
                推荐 {env.recommendation.width}² · {env.recommendation.steps} 步 · {env.recommendation.quant}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.55fr_1fr]">
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Boxes className="size-4 text-accent-500" />
                <h2 className="text-[13px] font-semibold">我的实例</h2>
                <span className="text-[10px] text-[var(--color-text-tertiary)]">{instances.length} 个</span>
              </div>
              <Button tone="ghost" onClick={() => navigate('/instances')}>
                管理
              </Button>
            </div>
            {instances.length === 0 ? (
              <EmptyState
                icon={<Boxes className="size-6" />}
                title="还没有实例"
                description="创建一个实例来固定 MOSS-Image 的版本与运行时。"
                action={
                  <Button tone="primary" onClick={() => navigate('/instances')}>
                    新建实例
                  </Button>
                }
              />
            ) : (
              <div className="mt-2 divide-y divide-[var(--color-border-subtle)]">
                {instances.slice(0, 3).map((instance) => (
                  <button
                    key={instance.id}
                    type="button"
                    onClick={() => navigate(`/instances/${instance.id}`)}
                    className="flex w-full items-center gap-3 py-2.5 text-left transition hover:bg-white/35 dark:hover:bg-white/[0.03]"
                  >
                    <StatusDot status={instance.status === 'ok' ? 'ok' : 'warn'} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[12px] font-medium">{instance.name}</span>
                        {instance.channel === 'stable' ? <Pill tone="blue">稳定版</Pill> : null}
                        {instance.channel === 'experimental' ? <Pill tone="amber">实验</Pill> : null}
                      </div>
                      <div className="mt-0.5 text-[10.5px] text-[var(--color-text-tertiary)]">
                        {instance.shortCommit} · {instance.runtimeState === 'ready' ? '运行时就绪' : '待安装依赖'} ·{' '}
                        {relative(instance.lastUsedAt ?? instance.createdAt)}
                      </div>
                    </div>
                    <ChevronRight className="size-3.5 text-[var(--color-text-tertiary)]" />
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="size-4 text-accent-500" />
                <h2 className="text-[13px] font-semibold">教程</h2>
              </div>
              <span className="text-[10px] text-[var(--color-text-tertiary)]">从示例开始</span>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
              {tutorials.map((tutorial) => (
                <button
                  key={tutorial.id}
                  type="button"
                  onClick={() => startTutorial(tutorial)}
                  className="group flex flex-col items-start gap-2 rounded-xl border border-[var(--color-border-subtle)] bg-white/35 p-3 text-left transition hover:-translate-y-0.5 hover:border-accent-400/40 hover:bg-white/55 dark:bg-white/[0.03] dark:hover:bg-white/[0.05]"
                >
                  <span className="flex size-7 items-center justify-center rounded-lg bg-accent-500/12 text-accent-600 dark:text-accent-300">
                    {tutorial.icon}
                  </span>
                  <span className="text-[11.5px] font-medium leading-5">{tutorial.title}</span>
                  <span className="text-[10px] leading-4 text-[var(--color-text-tertiary)]">
                    {tutorial.description}
                  </span>
                  <span className="mt-auto inline-flex items-center gap-1 text-[10px] text-accent-600 dark:text-accent-300">
                    {tutorial.tag === 'Layout' ? '载入布局' : '载入 Prompt'}
                    <ArrowRight className="size-3 transition group-hover:translate-x-0.5" />
                  </span>
                </button>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ImageIcon className="size-4 text-accent-500" />
                <h2 className="text-[13px] font-semibold">最近作品</h2>
              </div>
              <Button tone="ghost" onClick={() => navigate('/gallery')}>
                画廊
              </Button>
            </div>
            {recent.length === 0 ? (
              <div className="mt-2 flex flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--color-border)] px-4 py-8 text-center">
                <Wand2 className="size-5 text-[var(--color-text-tertiary)]" />
                <p className="text-[11px] text-[var(--color-text-secondary)]">生成的作品会自动出现在这里</p>
                <p className="text-[10px] text-[var(--color-text-tertiary)]">
                  也可以去设置里添加已有的输出目录
                </p>
              </div>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {recent.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate('/gallery')}
                    className="group relative aspect-square overflow-hidden rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-tertiary)]"
                  >
                    <img
                      src={cloverUrl(item.path)}
                      alt={item.name}
                      loading="lazy"
                      className="size-full object-cover transition duration-300 group-hover:scale-105"
                    />
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-4">
            <h2 className="text-[13px] font-semibold">设备与建议</h2>
            <div className="mt-2 space-y-2 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-text-tertiary)]">加速器</span>
                <span className="font-medium">{env?.gpu.name ?? '检测中'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-text-tertiary)]">内存</span>
                <span className="font-medium">
                  {env ? `${Math.round(env.device.memoryTotal / 1024 ** 3)} GB` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-text-tertiary)]">建议档位</span>
                <span className="font-medium">
                  {env ? `${env.recommendation.width}² · ${env.recommendation.steps} 步` : '—'}
                </span>
              </div>
            </div>
            <Button tone="secondary" className="mt-3 w-full" onClick={() => navigate('/settings')}>
              查看环境报告
            </Button>
          </Card>

          <Card className="p-4">
            <h2 className="text-[13px] font-semibold">快捷入口</h2>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {[
                { label: '模型库', to: '/models', icon: <Boxes className="size-3.5" /> },
                { label: '画廊', to: '/gallery', icon: <ImageIcon className="size-3.5" /> },
                { label: '创作', to: '/studio', icon: <Wand2 className="size-3.5" /> },
                { label: '设置', to: '/settings', icon: <Sparkles className="size-3.5" /> },
              ].map((entry) => (
                <button
                  key={entry.to}
                  type="button"
                  onClick={() => navigate(entry.to)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border border-[var(--color-border-subtle)] bg-white/35 px-2.5 py-2 text-[11px] text-[var(--color-text-secondary)] transition hover:border-accent-400/40 hover:text-accent-700 dark:bg-white/[0.03] dark:hover:text-accent-200',
                  )}
                >
                  {entry.icon}
                  {entry.label}
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
