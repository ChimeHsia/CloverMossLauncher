import { ExternalLink, FolderOpen, HardDrive, Info, RefreshCw, Save, Terminal } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Ipc } from '@shared/channels'
import type { AppInfo, Settings } from '@shared/types'
import { call } from '../lib/api'
import { bytes } from '../lib/format'
import { t } from '../lib/i18n'
import { useApp } from '../store'
import { Switch } from '@openai/apps-sdk-ui/components/Switch'
import { Button, Card, Pill, Segmented, cn, useToast } from '../components/ui'

export function SettingsPage(): React.JSX.Element {
  const toast = useToast()
  const { settings, env, saveSettings, refreshEnv, refreshUpdates } = useApp()
  const [draft, setDraft] = useState<Settings | null>(settings)
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(settings)
  }, [settings])

  useEffect(() => {
    void call<AppInfo>(Ipc.appInfo).then(setAppInfo).catch(() => undefined)
  }, [])

  const dirty = useMemo(
    () => Boolean(draft && settings && JSON.stringify(draft) !== JSON.stringify(settings)),
    [draft, settings],
  )

  if (!draft) {
    return <div className="py-20 text-center text-[12px] text-[var(--color-text-tertiary)]">{t('common.loading')}</div>
  }

  function patch(next: Partial<Settings>): void {
    setDraft((previous) => (previous ? { ...previous, ...next } : previous))
  }

  async function save(): Promise<void> {
    if (!draft) return
    setSaving(true)
    try {
      await saveSettings(draft)
      toast.push('设置已保存', 'success')
      await refreshEnv()
    } catch (error) {
      toast.push(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function checkUpdates(): Promise<void> {
    await refreshUpdates()
    toast.push('已检查更新（开发模式读取本地 release/）', 'info')
  }

  const selected = env?.network.selected

  return (
    <div className="space-y-5 pb-16">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">{t('settings.title')}</h1>
          <p className="mt-1 text-[12.5px] text-[var(--color-text-secondary)]">
            外观、网络、存储与运行时。修改后点右下角保存。
          </p>
        </div>
        <Button tone="primary" onClick={() => void save()} disabled={!dirty || saving}>
          <span className="inline-flex items-center gap-1.5">
            <Save className="size-3.5" /> {saving ? '保存中…' : t('common.save')}
          </span>
        </Button>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="px-5 py-4">
          <h2 className="text-[13px] font-semibold">{t('settings.appearance')}</h2>
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[12px] font-medium">主题</div>
                <div className="mt-0.5 text-[10.5px] text-[var(--color-text-tertiary)]">默认跟随系统</div>
              </div>
              <Segmented
                value={draft.theme}
                onChange={(theme) => patch({ theme })}
                options={[
                  { value: 'system', label: '系统' },
                  { value: 'light', label: '浅色' },
                  { value: 'dark', label: '深色' },
                ]}
              />
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-[var(--color-border-subtle)] pt-3">
              <div>
                <div className="text-[12px] font-medium">语言</div>
                <div className="mt-0.5 text-[10.5px] text-[var(--color-text-tertiary)]">
                  简体中文优先，英文文案已预留
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Pill tone="moss">简体中文</Pill>
                <Pill tone="neutral">English（soon）</Pill>
              </div>
            </div>
          </div>
        </Card>

        <Card className="px-5 py-4">
          <h2 className="text-[13px] font-semibold">{t('settings.network')}</h2>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[12px] font-medium">策略</div>
                <div className="mt-0.5 text-[10.5px] text-[var(--color-text-tertiary)]">
                  自动按延迟选择；镜像失败会回退
                </div>
              </div>
              <Segmented
                value={draft.networkMode}
                onChange={(networkMode) => patch({ networkMode })}
                options={[
                  { value: 'auto', label: '自动' },
                  { value: 'direct', label: '直连' },
                  { value: 'mirror', label: '镜像' },
                ]}
              />
            </div>
            <div className="rounded-lg bg-[var(--color-surface-secondary)] px-3 py-2 text-[10.5px] leading-5 text-[var(--color-text-secondary)]">
              <div>git：{selected?.git ?? '直连'}</div>
              <div>pip：{selected?.pip ?? '默认'}</div>
              <div>hf：{selected?.hf ?? '直连'}</div>
            </div>
            {(
              [
                ['gitMirror', 'git 镜像前缀', 'https://ghproxy.net/https://github.com/'],
                ['pipIndex', 'pip index', 'https://pypi.tuna.tsinghua.edu.cn/simple'],
                ['hfEndpoint', 'HF endpoint', 'https://hf-mirror.com'],
              ] as Array<[keyof Settings, string, string]>
            ).map(([key, label, placeholder]) => (
              <label key={String(key)} className="block space-y-1">
                <span className="text-[10.5px] text-[var(--color-text-tertiary)]">{label}（留空自动）</span>
                <input
                  value={String(draft[key] ?? '')}
                  placeholder={placeholder}
                  onChange={(event) => patch({ [key]: event.target.value || null } as Partial<Settings>)}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 font-mono text-[11px] outline-none focus:border-moss-500"
                />
              </label>
            ))}
          </div>
        </Card>

        <Card className="px-5 py-4">
          <h2 className="text-[13px] font-semibold">{t('settings.storage')}</h2>
          <div className="mt-3 space-y-3 text-[11.5px]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[12px] font-medium">模型目录</div>
                <div className="mt-0.5 break-all font-mono text-[10.5px] text-[var(--color-text-tertiary)]">
                  {env?.device.modelsPath ?? appInfo?.modelsPath ?? '—'}
                </div>
              </div>
              <Button
                tone="ghost"
                onClick={() => env && void call(Ipc.openPath, { path: env.device.modelsPath })}
              >
                <FolderOpen className="size-3.5" />
              </Button>
            </div>
            <div className="flex items-center justify-between border-t border-[var(--color-border-subtle)] pt-2.5">
              <span className="inline-flex items-center gap-1.5 text-[var(--color-text-tertiary)]">
                <HardDrive className="size-3.5" /> 剩余空间
              </span>
              <span>{bytes(env?.device.diskFree)}</span>
            </div>
            <label className="block space-y-1 border-t border-[var(--color-border-subtle)] pt-2.5">
              <span className="text-[10.5px] text-[var(--color-text-tertiary)]">自定义模型根目录（留空使用默认）</span>
              <input
                value={draft.modelsRoot ?? ''}
                placeholder="例如 /Volumes/Data/CloverMoss/models"
                onChange={(event) => patch({ modelsRoot: event.target.value || null })}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 font-mono text-[11px] outline-none focus:border-moss-500"
              />
            </label>
            <p className="text-[10.5px] leading-4 text-[var(--color-text-tertiary)]">
              迁移目录不会自动搬文件；建议先在新位置下载，再删除旧缓存。
            </p>
          </div>
        </Card>

        <Card className="px-5 py-4">
          <h2 className="text-[13px] font-semibold">{t('settings.runtime')}</h2>
          <div className="mt-3 space-y-3 text-[11.5px]">
            <label className="block space-y-1">
              <span className="text-[10.5px] text-[var(--color-text-tertiary)]">Python 解释器（留空自动发现）</span>
              <input
                value={draft.pythonPath ?? ''}
                placeholder="/opt/homebrew/bin/python3.12"
                onChange={(event) => patch({ pythonPath: event.target.value || null })}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 font-mono text-[11px] outline-none focus:border-moss-500"
              />
            </label>
            <div className="rounded-lg bg-[var(--color-surface-secondary)] px-3 py-2">
              <div className="mb-1 text-[10.5px] text-[var(--color-text-tertiary)]">已发现</div>
              {env?.pythons.length ? (
                <div className="space-y-0.5">
                  {env.pythons.map((python) => (
                    <div key={python.path} className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10.5px]">{python.version}</span>
                      <span className="truncate text-[10px] text-[var(--color-text-tertiary)]">
                        {python.source} · {python.path}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-[10.5px] text-[var(--color-text-tertiary)]">未发现 Python 3.10+</span>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-[var(--color-border-subtle)] pt-2.5">
              <div>
                <div className="text-[12px] font-medium">依赖缓存</div>
                <div className="mt-0.5 text-[10.5px] text-[var(--color-text-tertiary)]">
                  uv / pip 缓存位于应用数据目录
                </div>
              </div>
              <Pill tone="neutral">共享 runtime</Pill>
            </div>
          </div>
        </Card>

        <Card className="px-5 py-4">
          <h2 className="text-[13px] font-semibold">更新与公告</h2>
          <div className="mt-3 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[12px] font-medium">启动时检查更新</div>
                <div className="mt-0.5 text-[10.5px] text-[var(--color-text-tertiary)]">
                  读取仓库 /release 下的签名清单
                </div>
              </div>
              <Switch
                checked={draft.autoCheckUpdates}
                onCheckedChange={(value: boolean) => patch({ autoCheckUpdates: value })}
              />
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-[var(--color-border-subtle)] pt-2.5">
              <div>
                <div className="text-[12px] font-medium">当前版本</div>
                <div className="mt-0.5 text-[10.5px] text-[var(--color-text-tertiary)]">
                  {appInfo?.version ?? env?.appVersion ?? '0.1.0'} · Electron {appInfo?.electron ?? '—'}
                </div>
              </div>
              <Button tone="secondary" onClick={() => void checkUpdates()}>
                <span className="inline-flex items-center gap-1.5">
                  <RefreshCw className="size-3.5" /> 检查更新
                </span>
              </Button>
            </div>
            <p className="text-[10.5px] leading-4 text-[var(--color-text-tertiary)]">
              开发模式会优先读取本地 release/manifest.json，便于测试公告与更新流程。
            </p>
          </div>
        </Card>

        <Card className="px-5 py-4">
          <h2 className="text-[13px] font-semibold">{t('settings.about')}</h2>
          <div className="mt-3 space-y-2 text-[11.5px]">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-[var(--color-text-tertiary)]">
                <Info className="size-3.5" /> 产品
              </span>
              <span>CloverMoss Launcher</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-[var(--color-text-tertiary)]">
                <Terminal className="size-3.5" /> 运行时
              </span>
              <span className="font-mono text-[10.5px]">
                Node {appInfo?.node ?? '—'} · Chrome {appInfo?.chrome ?? '—'}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="shrink-0 text-[var(--color-text-tertiary)]">数据目录</span>
              <span className="break-all text-right font-mono text-[10px]">{appInfo?.dataPath ?? '—'}</span>
            </div>
            <button
              type="button"
              onClick={() =>
                void call(Ipc.openExternal, { url: 'https://github.com/CloverIris/CloverMossLauncher' })
              }
              className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-moss-600 hover:underline dark:text-moss-300"
            >
              项目主页与文档 <ExternalLink className="size-3" />
            </button>
          </div>
        </Card>
      </div>

      <div
        className={cn(
          'fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)] px-3 py-1.5 shadow-lg transition',
          dirty ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <span className="text-[11px] text-[var(--color-text-secondary)]">有未保存的更改</span>
        <Button tone="primary" size="sm" onClick={() => void save()} disabled={saving}>
          保存
        </Button>
      </div>
    </div>
  )
}
