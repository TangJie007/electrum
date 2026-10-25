import { Logger } from '@electrum/common'
import type { ScannedModule } from '../module/scanner'
import type { DIContainer } from '../di/container'

type LifecycleHook = 'onModuleInit' | 'onAppReady' | 'onModuleDestroy'

export class LifecycleManager {
  private logger = new Logger('Lifecycle')

  constructor(
    private container: DIContainer,
    private scannedModules: ScannedModule[],
  ) {}

  async runHook(hook: LifecycleHook): Promise<void> {
    const targets = await this.collectTargets(hook)

    const results = await Promise.allSettled(
      targets.map(({ name, instance }) => Promise.resolve(instance[hook]()).then(() => name)),
    )

    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      if (result.status === 'rejected') {
        this.logger.error(`${hook} failed for ${targets[i].name}: ${result.reason}`)
      }
    }
  }

  /**
   * 收集实现了该钩子的实例。
   *
   * - `onModuleInit` / `onAppReady`：按需创建（走异步解析，支持异步工厂依赖）
   * - `onModuleDestroy`：只处理**已创建过**的实例，避免在退出时反而去构造对象
   */
  private async collectTargets(
    hook: LifecycleHook,
  ): Promise<Array<{ name: string; instance: any }>> {
    const seen = new Set<unknown>()
    const targets: Array<{ name: string; instance: any }> = []
    const onlyExisting = hook === 'onModuleDestroy'

    for (const mod of this.scannedModules) {
      for (const cls of [...mod.controllers, ...mod.providers]) {
        if (!this.container.has(cls)) continue
        if (onlyExisting && !this.container.isInstantiated(cls)) continue

        const instance = await this.container.resolveAsync<any>(cls, mod.moduleClass)
        if (typeof instance?.[hook] !== 'function') continue
        // 同一实例可能同时出现在多个模块的 providers 里，钩子只跑一次
        if (seen.has(instance)) continue

        seen.add(instance)
        targets.push({ name: cls.name || String(cls), instance })
      }
    }

    return targets
  }
}
