import {
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
} from 'react'

type MotionPreset = 'page' | 'fade' | 'flyout' | 'dialog' | 'sheet' | 'toast'

const closedFrames: Record<MotionPreset, Keyframe> = {
  page: { opacity: 0, transform: 'translateY(8px)' },
  fade: { opacity: 0 },
  flyout: { opacity: 0, transform: 'translateY(-4px) scale(0.985)' },
  dialog: { opacity: 0, transform: 'translateY(8px) scale(0.985)' },
  sheet: { opacity: 0, transform: 'translateX(12px)' },
  toast: { opacity: 0, transform: 'translateY(6px)' },
}

const listeners = new Set<() => void>()
let stopWatching: (() => void) | undefined

function animationEnabled(): boolean {
  if (typeof window === 'undefined') return false
  const preference = document.documentElement.dataset.uiAnimation
  return preference === 'on' || (preference !== 'off' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (!stopWatching) {
    const notify = (): void => listeners.forEach((callback) => callback())
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const observer = new MutationObserver(notify)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-ui-animation'] })
    media.addEventListener('change', notify)
    stopWatching = () => {
      observer.disconnect()
      media.removeEventListener('change', notify)
    }
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      stopWatching?.()
      stopWatching = undefined
    }
  }
}

export function useUiAnimationEnabled(): boolean {
  return useSyncExternalStore(subscribe, animationEnabled, () => false)
}

function playMotion(
  element: HTMLElement,
  preset: MotionPreset,
  entering: boolean,
  interrupted: { current: Keyframe | undefined },
  onFinished?: () => void,
): () => void {
  const style = getComputedStyle(element)
  const durationValue = style.getPropertyValue('--motion-normal').trim()
  const parsedDuration = Number.parseFloat(durationValue)
  const duration = Number.isFinite(parsedDuration) ? parsedDuration * (durationValue.endsWith('ms') ? 1 : 1000) : 180
  const ease = style.getPropertyValue('--motion-ease').trim() || 'ease-out'
  const visible: Keyframe = preset === 'fade' ? { opacity: 1 } : { opacity: 1, transform: 'none' }
  const from = interrupted.current ?? (entering ? closedFrames[preset] : visible)
  interrupted.current = undefined
  const animation = element.animate([from, entering ? visible : closedFrames[preset]], { duration, easing: ease, fill: 'both' })
  let finished = false
  const finish = (): void => {
    if (finished) return
    finished = true
    window.clearTimeout(timer)
    if (entering) animation.cancel()
    else animation.finish()
    onFinished?.()
  }
  // Hidden windows may stop advancing their animation timeline. Never let that
  // hold a modal in the top layer or retain a dismissed surface indefinitely.
  const timer = window.setTimeout(finish, duration + 60)
  void animation.finished.then(finish, () => undefined)
  return () => {
    if (!finished) {
      finished = true
      const current = getComputedStyle(element)
      interrupted.current = preset === 'fade'
        ? { opacity: current.opacity }
        : { opacity: current.opacity, transform: current.transform }
    }
    window.clearTimeout(timer)
    animation.cancel()
  }
}

export function useMotionPresence(open: boolean, preset: MotionPreset, onExited?: () => void) {
  const enabled = useUiAnimationEnabled()
  const [retained, setRetained] = useState(open)
  // Mount an opened layer immediately; only a completed exit releases it.
  if (open && !retained) setRetained(true)
  const ref = useRef<HTMLDivElement>(null)
  const wasOpen = useRef(false)
  const interrupted = useRef<Keyframe | undefined>(undefined)
  const exited = useRef(onExited)
  exited.current = onExited

  useLayoutEffect(() => {
    const element = ref.current
    const opening = open && !wasOpen.current
    wasOpen.current = open
    if (!element) return
    const finishExit = (): void => {
      setRetained(false)
      exited.current?.()
    }
    if (!enabled) {
      interrupted.current = undefined
      if (!open) finishExit()
      return
    }
    if (open && !opening && !interrupted.current) return
    return playMotion(element, preset, open, interrupted, open ? undefined : finishExit)
  }, [open, preset, enabled])

  return { present: open || retained, ref }
}

export function Presence({
  open,
  preset = 'fade',
  onExited,
  children,
  ...props
}: Omit<ComponentProps<'div'>, 'ref'> & {
  open: boolean
  preset?: MotionPreset
  onExited?: () => void
}): React.JSX.Element | null {
  const { present, ref } = useMotionPresence(open, preset, onExited)
  const content = useRef(children)
  if (open) content.current = children
  if (!present) return null
  return (
    <div {...props} ref={ref} data-motion-state={open ? 'open' : 'closed'} inert={!open} aria-hidden={!open || undefined}>
      {content.current}
    </div>
  )
}

export function MotionPanel({
  transitionKey,
  children,
  ...props
}: Omit<ComponentProps<'div'>, 'ref'> & { transitionKey: string | number }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const enabled = useUiAnimationEnabled()
  const previous = useRef<string | number | undefined>(undefined)
  const interrupted = useRef<Keyframe | undefined>(undefined)
  useLayoutEffect(() => {
    const changed = previous.current !== transitionKey
    previous.current = transitionKey
    if (!enabled || changed) interrupted.current = undefined
    if (!enabled || (!changed && !interrupted.current) || !ref.current) return
    return playMotion(ref.current, 'page', true, interrupted)
  }, [transitionKey, enabled])
  // Only the current page is mounted: no overlapping forms, duplicated effects,
  // delayed navigation or stale outgoing page that can still receive input.
  return <div {...props} ref={ref}>{children}</div>
}

export function Collapse({
  open,
  children,
  className = '',
  ...props
}: Omit<ComponentProps<'div'>, 'ref'> & { open: boolean }): React.JSX.Element {
  return (
    <div {...props} className={`app-collapse ${className}`} data-open={open} aria-hidden={!open} inert={!open}>
      <div className="app-collapse-inner">{children}</div>
    </div>
  )
}
