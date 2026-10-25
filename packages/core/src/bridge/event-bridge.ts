import { app } from 'electron'
import { META, readMetadata, Logger, type AppEventEntry } from '@electrum/common'
import type { DIContainer } from '../di/container'
import type { ScannedModule } from '../module/scanner'

/**
 * 把 Controller / Provider 上的 `@AppEvent` 接到 Electron `app.on`。
 *
 * 与 IpcBridge（渲染进程 ↔ 主进程 IPC）不同，这里监听的是应用生命周期事件，
 * 例如 `ready`、`window-all-closed`、`activate`、`before-quit` 等。
 *
 * 流程：读 META.APP_EVENT → resolve 实例 → `app.on(event, (...args) => instance[method](...args))`
 * Application.start 里在 IpcBridge 之后调用 `registerAll()`。
 */
export class EventBridge {
  private logger = new Logger('EventBridge')
  private registeredListeners: Array<{ event: string; listener: (...args: any[]) => void }> = []

  constructor(
    private container: DIContainer,
    private scannedModules: ScannedModule[],
  ) {}

  /**
   * 遍历已扫描模块的 controllers + providers，绑定所有 @AppEvent。
   *
   * 走 `resolveAsync`：依赖图里含异步 `useFactory` 时也能正确就绪。
   */
  async registerAll(): Promise<void> {
    for (const mod of this.scannedModules) {
      for (const cls of [...mod.controllers, ...mod.providers]) {
        await this.bindEvents(cls, mod.moduleClass)
      }
    }
  }

  private async bindEvents(targetClass: Function, moduleClass?: Function): Promise<void> {
    const handlers = readMetadata<AppEventEntry[]>(targetClass, META.APP_EVENT) || []
    if (handlers.length === 0) return

    const instance = await this.container.resolveAsync<any>(targetClass, moduleClass)

    for (const { event, method } of handlers) {
      const listener = (...args: any[]) => {
        // 与 IPC 对齐：一次事件回调也视为一个 request 作用域，
        // 这样 @AppEvent 处理器里可以安全使用 request-scoped Provider
        void this.container
          .runInRequestScopeAsync(async () => instance[method](...args))
          .catch((err: any) =>
            this.logger.error(`AppEvent "${event}" error: ${err?.message || err}`),
          )
      }

      app.on(event as any, listener)
      this.registeredListeners.push({ event: event as string, listener })
      this.logger.debug(`Bound app.on("${event}") → ${targetClass.name}.${String(method)}`)
    }
  }

  /** 拆除本桥接注册过的全部 app 事件监听，供 Application.shutdown 调用 */
  unregisterAll(): void {
    for (const { event, listener } of this.registeredListeners) {
      app.removeListener(event as any, listener)
    }
    this.registeredListeners = []
  }
}
