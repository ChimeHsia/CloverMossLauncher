import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { OnboardingStatus, OnboardingStep } from '@shared/types'
import { paths } from '../lib/paths'
import { listInstances } from './instances'
import { readRuntime } from './runtimes'

export async function getOnboardingStatus(settings: { modelsRoot: string | null }): Promise<OnboardingStatus> {
  const instances = await listInstances()
  let runtimeReady = false
  for (const instance of instances) {
    const runtime = await readRuntime(instance.runtimeId)
    if (runtime?.state === 'ready') {
      runtimeReady = true
      break
    }
  }
  const modelReady = existsSync(
    join(paths.hub(settings.modelsRoot), 'models--OpenMOSS-Team--MOSS-Image-SFT'),
  )

  const steps: OnboardingStep[] = [
    {
      id: 'instance',
      status: instances.length ? 'ok' : 'missing',
      title: '实例',
      detail: instances.length ? `已有 ${instances.length} 个版本实例` : '还没有安装 MOSS-Image 实例',
      action: 'instances',
    },
    {
      id: 'runtime',
      status: runtimeReady ? 'ok' : instances.length ? 'partial' : 'missing',
      title: '运行时',
      detail: runtimeReady ? 'Python 依赖已就绪' : instances.length ? '实例已有，但依赖还没装完' : '等待实例创建',
      action: 'instances',
    },
    {
      id: 'model',
      status: modelReady ? 'ok' : 'missing',
      title: '模型',
      detail: modelReady ? 'SFT 权重已缓存' : '还没有下载 MOSS-Image-SFT（约 27 GB）',
      action: 'models',
    },
  ]

  return {
    ready: steps.every((step) => step.status === 'ok'),
    steps,
    checkedAt: new Date().toISOString(),
  }
}
