import { join } from 'node:path'
import type { OnboardingStatus, OnboardingStep, Settings } from '@shared/types'
import { paths } from '../lib/paths'
import { listInstances } from './instances'
import { readRuntime } from './runtimes'
import { getCatalog } from './models'
import { legacyModelReady } from './modelReadiness'

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
  const catalog = await getCatalog(settings as Settings)
  const modelReady = catalog.bundles.some((bundle) => [...Object.values(bundle.components), bundle.support].every((id) => catalog.models.find((model) => model.id === id)?.installed)) || await legacyModelReady(join(paths.hub(settings.modelsRoot), 'models--OpenMOSS-Team--MOSS-Image-SFT'))

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
      detail: modelReady ? '模型组件已就绪' : '在模型库补齐一套模型组件后即可使用',
      action: 'models',
    },
  ]

  return {
    ready: steps.every((step) => step.status === 'ok'),
    steps,
    checkedAt: new Date().toISOString(),
  }
}
