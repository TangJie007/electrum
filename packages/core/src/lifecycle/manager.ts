import { Logger, type LifecycleHookName } from '@electrum/common'
import type { ScannedModule } from '../module/scanner'
import type { DIContainer } from '../di/container'

/** 复用 common 的契约：接口改名 / 增删钩子时这里会编译报错，不会静默脱钩 */
type LifecycleHook = LifecycleHookName

export class LifecycleManager {
  private logger = new Logger('Lifecycle')

  constructor(
    private container: DIContainer,
    private scannedModules: ScannedModule[],
  ) {}

  /**
   * 按顺序执行钩子。
   *
   * 必须**串行**：模块间常有隐式顺序（A 先建连接、B 再用），并发会让
   * `onModuleInit` 变成竞态。销毁时再反过来 —— 后初始化（依赖方）先销毁。
   * 单个模块抛错只记录，不打断其余模块。
   */
  async runHook(hook: LifecycleHook): Promise<void> {
    const targets = await this.collectTargets(hook)
    const ordered = hook === 'onModuleDestroy' ? [...targets].reverse() : targets

    for (const { name, instance } of ordered) {
      try {
        await instance[hook]()
      } catch (err: any) {
        this.logger.error(`${hook} failed for ${name}: ${err?.message || err}`)
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
        // request 作用域解析出来的是代理，作用域外读属性会直接抛错；
        // 这类实例也不该有全局生命周期钩子（随请求创建、随请求销毁）
        if (this.container.getScope(cls) === 'request') continue
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
