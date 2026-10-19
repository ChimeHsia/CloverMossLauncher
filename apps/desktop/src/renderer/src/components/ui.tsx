import { Button as SdkButton } from '@openai/apps-sdk-ui/components/Button'
import { Markdown } from '@openai/apps-sdk-ui/components/Markdown'
import { AlertCircle, Check, Info, Loader2, X } from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react'
import type { CheckStatus } from '@shared/types'

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

export function Card({
  className,
  children,
  ...rest
}: ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      className={cn(
        'glass rounded-[6px] border border-[var(--color-border-subtle)]',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}

const statusColor: Record<CheckStatus, string> = {
  ok: 'bg-sky-500',
  warn: 'bg-amber-500',
  error: 'bg-red-500',
  unknown: 'bg-neutral-400',
}

export function StatusDot({ status, className }: { status: CheckStatus; className?: string }): React.JSX.Element {
  return <span className={cn('inline-block size-2 shrink-0 rounded-full', statusColor[status], className)} />
}

type PillTone = 'neutral' | 'accent' | 'amber' | 'red' | 'blue'

const pillTone: Record<PillTone, string> = {
  neutral: 'border-[var(--color-border)] text-[var(--color-text-secondary)]',
  accent: 'border-accent-500/25 bg-accent-500/10 text-accent-600 dark:text-accent-300',
  amber: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  red: 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300',
  blue: 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300',
}

export function Pill({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: PillTone
  className?: string
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[3px] border px-1.5 py-0.5 text-[10px] font-medium leading-4',
        pillTone[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

type ButtonTone = 'primary' | 'secondary' | 'ghost' | 'danger'

export function Button({
  tone = 'secondary',
  size = 'sm',
  className,
  children,
  style,
  ...rest
}: Omit<ComponentProps<typeof SdkButton>, 'color' | 'variant'> & {
  tone?: ButtonTone
}): React.JSX.Element {
  const color = tone === 'danger' ? 'danger' : tone === 'primary' ? 'primary' : 'secondary'
  const variant = tone === 'primary' ? 'solid' : tone === 'ghost' ? 'ghost' : 'soft'
  const tint =
    tone === 'secondary'
      ? 'border border-[var(--color-border-subtle)] bg-white/[0.045]'
      : ''
  return (
    <SdkButton
      color={color}
      variant={variant}
      size={size}
      className={cn(tint, className)}
      style={{
        borderRadius: 4,
        fontSize: 12,
        lineHeight: '16px',
        minHeight: 30,
        paddingInline: 12,
        color: tone === 'primary' ? '#ffffff' : undefined,
        ...style,
      }}
      {...rest}
    >
      {children}
    </SdkButton>
  )
}

export function IconButton({
  label,
  children,
  className,
  ...rest
}: ComponentProps<'button'> & { label: string }): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-7 items-center justify-center rounded-[6px] text-[var(--color-text-secondary)] transition hover:bg-white/[0.07] hover:text-[var(--color-text)]',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

export function ProgressBar({
  value,
  tone = 'accent',
  className,
}: {
  value: number
  tone?: 'accent' | 'neutral'
  className?: string
}): React.JSX.Element {
  const width = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
  return (
    <div className={cn('h-[3px] w-full overflow-hidden rounded-full bg-white/[0.08]', className)}>
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-300 ease-out',
          tone === 'accent' ? 'bg-accent-500' : 'bg-[var(--color-text-tertiary)]',
        )}
        style={{ width: `${width}%` }}
      />
    </div>
  )
}

export function Spinner({ className }: { className?: string }): React.JSX.Element {
  return <Loader2 className={cn('size-4 animate-spin', className)} />
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--color-border)] px-6 py-12 text-center">
      {icon ? <div className="text-[var(--color-text-tertiary)]">{icon}</div> : null}
      <p className="text-sm font-medium">{title}</p>
      {description ? (
        <p className="max-w-md text-[13px] leading-5 text-[var(--color-text-secondary)]">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 'max-w-2xl',
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  width?: string
}): React.JSX.Element | null {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-6 backdrop-blur-[2px]"
      onMouseDown={onClose}
    >
      <div
        className={cn(
          'glass-strong flex max-h-[82vh] w-full flex-col overflow-hidden rounded-[6px] border border-[var(--color-border-subtle)] shadow-2xl',
          width,
        )}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-[var(--color-border-subtle)] px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold">{title}</h2>
            {description ? (
              <p className="mt-1 text-[12.5px] leading-5 text-[var(--color-text-secondary)]">{description}</p>
            ) : null}
          </div>
          <IconButton label="关闭" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <footer className="flex items-center justify-end gap-2 border-t border-[var(--color-border-subtle)] px-5 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  )
}

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 'max-w-[520px]',
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  width?: string
}): React.JSX.Element | null {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-[2px]"
      onMouseDown={onClose}
    >
      <div
        className={cn(
          'glass-strong flex h-full w-full flex-col border-l border-[var(--color-border-subtle)] shadow-2xl',
          width,
        )}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-[var(--color-border-subtle)] px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold">{title}</h2>
            {description ? (
              <p className="mt-1 text-[12px] leading-5 text-[var(--color-text-secondary)]">{description}</p>
            ) : null}
          </div>
          <IconButton label="关闭" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <footer className="flex items-center justify-end gap-2 border-t border-[var(--color-border-subtle)] px-5 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  )
}

type ToastTone = 'info' | 'success' | 'error'

interface ToastItem {
  id: string
  message: string
  tone: ToastTone
}

const ToastContext = createContext<{ push: (message: string, tone?: ToastTone) => void }>({
  push: () => undefined,
})

export function useToast(): { push: (message: string, tone?: ToastTone) => void } {
  return useContext(ToastContext)
}

const toastIcon: Record<ToastTone, ReactNode> = {
  info: <Info className="size-4 text-sky-500" />,
  success: <Check className="size-4 text-sky-500" />,
  error: <AlertCircle className="size-4 text-red-500" />,
}

export function ToastProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [items, setItems] = useState<ToastItem[]>([])
  const push = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = crypto.randomUUID()
    setItems((previous) => [...previous.slice(-2), { id, message, tone }])
    window.setTimeout(() => {
      setItems((previous) => previous.filter((item) => item.id !== id))
    }, 5000)
  }, [])
  const value = useMemo(() => ({ push }), [push])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[300px] flex-col gap-1.5">
        {items.map((item) => (
          <div
            key={item.id}
            className="glass-strong pointer-events-auto flex items-start gap-2 rounded-[6px] border border-[var(--color-border-subtle)] px-2.5 py-2 text-[11.5px] shadow-lg"
          >
            {toastIcon[item.tone]}
            <span className="leading-5">{item.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function MarkdownBody({ children }: { children: string }): React.JSX.Element {
  return (
    <div className="clover-md text-[13px] leading-6 text-[var(--color-text-secondary)]">
      <Markdown breakNewLines skipHtml>
        {children}
      </Markdown>
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T
  options: Array<{ value: T; label: string; hint?: string }>
  onChange: (value: T) => void
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('inline-flex rounded-[4px] border border-[var(--color-border-subtle)] bg-white/[0.035] p-0.5', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.hint}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-[3px] px-2.5 py-1 text-[10.5px] font-medium transition',
            value === option.value
              ? 'bg-white/[0.09] text-[var(--color-text)] shadow-sm'
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
