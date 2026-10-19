import { AlertCircle, Check, ChevronRight, RefreshCw, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { OnboardingStatus } from '@shared/types'
import { useApp } from '../store'
import { Button, IconButton, cn } from './ui'

export function Oobe({
  open,
  status,
  onClose,
}: {
  open: boolean
  status: OnboardingStatus
  onClose: () => void
}): React.JSX.Element | null {
  const navigate = useNavigate()
  const refreshOnboarding = useApp((state) => state.refreshOnboarding)
  if (!open) return null

  const remaining = status.steps.filter((step) => step.status !== 'ok').length

  function go(action: OnboardingStatus['steps'][number]['action']): void {
    onClose()
    if (action === 'instances') navigate('/instances')
    else if (action === 'models') navigate('/models')
    else navigate('/settings')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6 backdrop-blur-[2px]">
      <div
        className="glass-strong flex w-full max-w-[560px] flex-col overflow-hidden rounded-[6px] border border-[var(--color-border)] shadow-[0_30px_90px_rgba(0,0,0,0.55)]"
        role="dialog"
        aria-modal="true"
        aria-label="初始设置"
      >
        <header className="flex items-start justify-between gap-4 border-b border-[var(--color-border-subtle)] px-5 py-4">
          <div>
            <div className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-accent-300">
              First run
            </div>
            <h2 className="mt-1 text-[18px] font-semibold tracking-tight">先把 MOSS 准备好</h2>
            <p className="mt-1 text-[11px] leading-5 text-[var(--color-text-secondary)]">
              还差 {remaining} 项就能直接启动。完成之前，每次打开启动器都会出现这张清单。
            </p>
          </div>
          <IconButton label="关闭初始设置" className="size-7" onClick={onClose}>
            <X className="size-3.5" />
          </IconButton>
        </header>

        <div className="px-5">
          {status.steps.map((step) => {
            const ok = step.status === 'ok'
            return (
              <div
                key={step.id}
                className="flex items-center gap-3 border-b border-[var(--color-border-subtle)] py-3.5 last:border-0"
              >
                <div
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-full border',
                    ok
                      ? 'border-accent-500/30 bg-accent-500/10 text-accent-300'
                      : 'border-amber-500/25 bg-amber-500/[0.07] text-amber-300',
                  )}
                >
                  {ok ? <Check className="size-3.5" /> : <AlertCircle className="size-3.5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[12px] font-medium">{step.title}</span>
                    <span className="text-[9.5px] text-[var(--color-text-tertiary)]">
                      {ok ? '就绪' : step.status === 'partial' ? '未完成' : '缺失'}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[10.5px] text-[var(--color-text-tertiary)]">{step.detail}</p>
                </div>
                {!ok ? (
                  <Button tone="secondary" onClick={() => go(step.action)}>
                    <span className="inline-flex items-center gap-1">
                      {step.action === 'models' ? '打开模型' : '去处理'}
                      <ChevronRight className="size-3" />
                    </span>
                  </Button>
                ) : null}
              </div>
            )
          })}
        </div>

        <footer className="flex items-center justify-between border-t border-[var(--color-border-subtle)] px-5 py-3">
          <button
            type="button"
            onClick={() => void refreshOnboarding()}
            className="inline-flex items-center gap-1.5 text-[10.5px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
          >
            <RefreshCw className="size-3" /> 重新检查
          </button>
          <div className="flex items-center gap-1.5">
            <Button tone="ghost" onClick={onClose}>
              本次跳过
            </Button>
            <Button
              tone="primary"
              onClick={() => go(status.steps.find((step) => step.status !== 'ok')?.action ?? 'instances')}
            >
              开始配置
            </Button>
          </div>
        </footer>
      </div>
    </div>
  )
}
