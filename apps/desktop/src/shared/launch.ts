import type {
  GradioLaunchConfig,
  GradioListen,
  GradioOpenMode,
  GradioProfile,
  WorkspaceKind,
} from './types'

export const GRADIO_PROFILES: GradioProfile[] = ['auto', '16gb', '24gb', '48gb']
export const GRADIO_LISTENS: GradioListen[] = ['local', 'lan']
export const GRADIO_OPEN_MODES: GradioOpenMode[] = ['browser', 'app-window', 'copy']
export const DEFAULT_GRADIO_MODEL = 'OpenMOSS-Team/MOSS-Image-SFT'

export const GRADIO_PROFILE_LABELS: Record<GradioProfile, string> = {
  auto: '自动档',
  '16gb': '16 GB',
  '24gb': '24 GB',
  '48gb': '48 GB',
}

export const GRADIO_LISTEN_LABELS: Record<GradioListen, string> = {
  local: '仅本机',
  lan: '局域网',
}

export const GRADIO_OPEN_LABELS: Record<GradioOpenMode, string> = {
  browser: '系统浏览器',
  'app-window': '应用内窗口',
  copy: '仅复制地址',
}

export const WORKSPACE_LABELS: Record<WorkspaceKind, string> = {
  official: '官方 Gradio（已退役）',
  clover: 'MossStudio',
}

/** Normalizes the legacy `backend` field and the current `workspace` field. */
export function normalizeWorkspace(_value: unknown): WorkspaceKind {
  // ADR-0007: official Gradio is retired. Reading an old Case always migrates
  // it to MossStudio instead of preserving a launch path we no longer support.
  return 'clover'
}

export function createDefaultGradioConfig(): GradioLaunchConfig {
  return {
    modelSource: 'instance',
    model: DEFAULT_GRADIO_MODEL,
    modelRoot: undefined,
    localFilesOnly: false,
    outputDir: undefined,
    promptDefaults: undefined,
    profile: 'auto',
    listen: 'local',
    port: null,
    openMode: 'browser',
    extraArgs: undefined,
  }
}

function optionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

/** Fills defaults and drops fields that the official Gradio app does not accept. */
export function normalizeGradioConfig(
  input?: Partial<GradioLaunchConfig> | null,
): GradioLaunchConfig {
  const defaults = createDefaultGradioConfig()
  if (!input) return defaults
  const extra = splitCommandArgs(input.extraArgs)
  let extraModel: string | undefined
  for (let i = 0; i < extra.length; i += 1) {
    if (extra[i] === '--model') extraModel = optionalText(extra[i + 1])
    else if (extra[i]?.startsWith('--model=')) extraModel = optionalText(extra[i]!.slice(8))
  }
  const profile = GRADIO_PROFILES.includes(input.profile as GradioProfile)
    ? (input.profile as GradioProfile)
    : defaults.profile
  const listen = GRADIO_LISTENS.includes(input.listen as GradioListen)
    ? (input.listen as GradioListen)
    : defaults.listen
  const openMode = GRADIO_OPEN_MODES.includes(input.openMode as GradioOpenMode)
    ? (input.openMode as GradioOpenMode)
    : defaults.openMode
  const port =
    typeof input.port === 'number' && Number.isInteger(input.port) && input.port >= 1024 && input.port <= 65535
      ? input.port
      : null
  return {
    modelSource: extraModel ? 'custom' : input.modelSource ?? (optionalText(input.model) && input.model !== DEFAULT_GRADIO_MODEL ? 'custom' : 'instance'),
    model: extraModel ?? optionalText(input.model) ?? DEFAULT_GRADIO_MODEL,
    modelRoot: optionalText(input.modelRoot),
    localFilesOnly: input.localFilesOnly === true,
    outputDir: optionalText(input.outputDir),
    promptDefaults: optionalText(input.promptDefaults),
    profile,
    listen,
    port,
    openMode,
    extraArgs: optionalText(input.extraArgs),
  }
}

/**
 * Conservative argv splitter for the advanced Gradio args field.
 * Quoted paths keep spaces; unquoted Windows paths keep their backslashes.
 */
export function splitCommandArgs(input: string | undefined): string[] {
  if (!input?.trim()) return []
  const args: string[] = []
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g
  for (const match of input.matchAll(pattern)) {
    const value = match[1] ?? match[2] ?? match[3]
    if (value) args.push(value)
  }
  return args
}

export function gradioHost(config: GradioLaunchConfig): string {
  return config.listen === 'lan' ? '0.0.0.0' : '127.0.0.1'
}

/** Arguments passed after `gradio_app.py`. `port` has already been resolved. */
export function buildGradioArgs(config: GradioLaunchConfig, port: number): string[] {
  const args: string[] = ['--host', gradioHost(config), '--port', String(port)]
  if (config.model) args.push('--model', config.model)
  if (config.modelRoot) args.push('--model-root', config.modelRoot)
  if (config.profile !== 'auto') args.push('--profile', config.profile)
  if (config.outputDir) args.push('--output-dir', config.outputDir)
  if (config.promptDefaults) args.push('--prompt-defaults', config.promptDefaults)
  if (config.localFilesOnly) args.push('--local-files-only')
  args.push(...splitCommandArgs(config.extraArgs))
  return args
}

function quoteArg(value: string): string {
  return /[\s"']/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value
}

export function gradioCommandPreview(config: GradioLaunchConfig): string {
  const actualPort = config.port ?? 1
  const args = buildGradioArgs(config, actualPort).map((arg, index, all) => {
    if (config.port === null && all[index - 1] === '--port') return '<自动>'
    return quoteArg(arg)
  })
  return ['python', 'gradio_app.py', ...args].join(' ')
}

function shortModel(model: string | undefined): string {
  if (!model || model === DEFAULT_GRADIO_MODEL) return 'SFT'
  const name = model.split(/[\\/]/).filter(Boolean).pop() ?? model
  return name.length > 22 ? `${name.slice(0, 21)}…` : name
}

export function gradioSummary(config: GradioLaunchConfig): string {
  return [
    config.modelSource === 'instance' ? '实例模型' : shortModel(config.model),
    GRADIO_PROFILE_LABELS[config.profile],
    config.port ? `:${config.port}` : '自动端口',
  ].join(' · ')
}

export function gradioIsDefault(config: GradioLaunchConfig): boolean {
  const defaults = createDefaultGradioConfig()
  return JSON.stringify(config) === JSON.stringify(defaults)
}
