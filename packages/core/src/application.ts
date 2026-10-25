import { Logger, type InjectionToken } from '@electrum/common'
import { app as electronApp } from 'electron'
import { DIContainer } from './di/container'
import { ModuleScanner, type ScannedModule } from './module/scanner'
import { buildModuleGraph, toMermaid, type ModuleGraph } from './module/graph'
import { MiddlewarePipeline } from './middleware/pipeline'
import { IpcBridge } from './bridge/ipc-bridge'
import { EventBridge } from './bridge/event-bridge'
import { WindowManager } from './window/manager'
import { LifecycleManager } from './lifecycle/manager'
import type { Plugin } from './plugin/plugin.interface'

/**
 * Core 运行时主编排类（框架核心入口）。
 *
 * 职责：持有 DI / 管道 / 窗口等组件，在 start() 中按固定顺序：
 * 扫描模块 → 等 Electron ready → 建窗口 → 绑 IPC/App 事件 → 跑生命周期钩子。
 *
 */
export class Application {
  /** 全局 DI 容器：注册 Provider、resolve Controller、属性注入 */
  private container = new DIContainer()

  /** 扫描根模块后得到的模块树快照（含 controllers / providers / declarations） */
  private scannedModules: ScannedModule[] = []

  /** IPC 中间件管道：Guard → Pipe → Interceptor → Filter */
  private pipeline = new MiddlewarePipeline(this.container)

  /** 声明式窗口管理，并向 DI 提供 @WindowRef 取值 */
  private windowManager = new WindowManager(this.container)

  /** Controller 方法 → ipcMain.handle / on（start 后才创建） */
  private ipcBridge?: IpcBridge

  /** @AppEvent → electron app.on（start 后才创建） */
  private eventBridge?: EventBridge

  /** onModuleInit / onAppReady / onModuleDestroy */
  private lifecycle?: LifecycleManager

  private plugins: Plugin[] = []
  private readyPlugins = new Set<Plugin>()
  private logger = new Logger('Application')
  private started = false
  /** 正在启动：并发调用 start() 复用同一个 Promise，避免重复扫描 / 重复挂 IPC */
  private starting?: Promise<this>
  /** 正在 / 已经关闭：shutdown 只跑一次 */
  private shutdownPromise?: Promise<void>
  private closed = false
  private quitHookInstalled = false
  private shutdownDone = false

  /**
   * @param rootModule 根模块类（须有 @Module），一般是 AppModule
   */
  constructor(private rootModule: Function) {}

  /**
   * 注册插件：立刻调用 install；ready 在 start() 生命周期之后触发。
   * 若 `start()` 之后再注册，install 立即执行且 ready 会补跑一次。
   */
  use(plugin: Plugin): this {
    this.plugins.push(plugin)
    plugin.install(this)
    if (this.started) void this.runPluginReady(plugin)
    return this
  }

  /** 全局 Filter（IPC Handle 异常时优先业务 Filter，再落到全局） */
  useGlobalFilters(...filters: Function[]): this {
    this.pipeline.useGlobalFilters(...filters)
    return this
  }

  /** 全局 Guard：所有 IPC 通道执行前校验 */
  useGlobalGuards(...guards: Function[]): this {
    this.pipeline.useGlobalGuards(...guards)
    return this
  }

  /** 全局 Pipe：变换 Handle 的第一个业务参数 */
  useGlobalPipes(...pipes: Function[]): this {
    this.pipeline.useGlobalPipes(...pipes)
    return this
  }

  /** 全局 Interceptor：洋葱模型包裹 Controller 方法 */
  useGlobalInterceptors(...interceptors: Function[]): this {
    this.pipeline.useGlobalInterceptors(...interceptors)
    return this
  }

  /** 手动从容器取实例（调试 / 插件扩展用）。图中有异步工厂时请用 `resolveAsync` */
  resolve<T>(token: InjectionToken<T>): T {
    return this.container.resolve<T>(token)
  }

  /** 异步取实例：支持返回 Promise 的 `useFactory` */
  async resolveAsync<T>(token: InjectionToken<T>): Promise<T> {
    return this.container.resolveAsync<T>(token)
  }

  /**
   * 模块图（JSON 结构）：模块、imports / exports 关系、每个模块注册的 Provider。
   *
   * 只读容器，不实例化任何东西；`start()` 之前调用返回空图。
   */
  getModuleGraph(): ModuleGraph {
    return buildModuleGraph(
      this.scannedModules,
      this.container.getModuleRegistry(),
      this.container,
    )
  }

  /** 模块图的 mermaid 源码（可贴进文档或控制台排查依赖方向） */
  printModuleGraph(): string {
    return toMermaid(this.getModuleGraph())
  }

  /** 扫描结果快照（`start()` 之后可用；调试 / 测试用） */
  getScannedModules(): readonly ScannedModule[] {
    return this.scannedModules
  }

  getWindowManager(): WindowManager {
    return this.windowManager
  }

  getContainer(): DIContainer {
    return this.container
  }

  /**
   * 启动应用（幂等）。
   *
   * 顺序要点：必须先 WindowManager.initialize，再 IpcBridge.registerAll。
   * 因为注册 IPC 时会 resolve Controller，其上可能有 @WindowRef，窗必须已存在。
   *
   * 任一步失败都会回滚（拆已挂的监听、销毁已建窗口、重置容器），
   * 避免「第二次 start() 出现 Attempted to register a second handler」。
   */
  async start(): Promise<this> {
    if (this.closed) {
      throw new Error(
        'Application has been shut down and cannot be started again. Create a new Application instance.',
      )
    }
    if (this.started) return this
    if (this.starting) return this.starting

    const starting = this.bootstrap()
    this.starting = starting
    try {
      return await starting
    } finally {
      if (this.starting === starting) this.starting = undefined
    }
  }

  private async bootstrap(): Promise<this> {
    try {
      // 1. 递归扫描 @Module 树，把 providers / controllers 注册进 DI
      const scanner = new ModuleScanner(this.container)
      this.scannedModules = scanner.scan(this.rootModule)

      // 2. 等待 Electron 主进程就绪
      await electronApp.whenReady()

      // 3. 创建声明式窗口，并 setWindowProvider / setWindowSender，供 @WindowRef / @IpcEmit
      await this.windowManager.initialize(this.scannedModules)
      this.container.setWindowSender((target, channel, ...args) => {
        if (target === 'broadcast') this.windowManager.broadcast(channel, ...args)
        else this.windowManager.sendTo(target, channel, ...args)
      })

      // 4. 解析各 Controller（异步路径），按 prefix:channel 绑定 ipcMain.handle / on
      this.ipcBridge = new IpcBridge(this.container, this.scannedModules, this.pipeline)
      await this.ipcBridge.registerAll()

      // 5. 绑定 @AppEvent 到 app.on
      this.eventBridge = new EventBridge(this.container, this.scannedModules)
      await this.eventBridge.registerAll()

      // 6. 生命周期：先模块初始化，再应用就绪
      this.lifecycle = new LifecycleManager(this.container, this.scannedModules)
      await this.lifecycle.runHook('onModuleInit')
      await this.lifecycle.runHook('onAppReady')

      // 7. 插件 ready（此时 IPC / 窗口均已可用）
      for (const plugin of this.plugins) await this.runPluginReady(plugin)

      // 8. 退出时走 shutdown，并等它跑完再真正退出
      this.installQuitHook()

      this.started = true
      this.logger.log('Application started')
      return this
    } catch (err) {
      await this.rollbackStart(err)
      throw err
    }
  }

  /**
   * 应用退出清理（幂等）。
   *
   * 顺序：插件 destroy → 销毁实例（onModuleDestroy / dispose，逆创建序）→
   * 拆 IPC / AppEvent → 关窗口。
   *
   * 这里不再单独调 `lifecycle.runHook('onModuleDestroy')`：容器按**逆创建序**
   * 统一回调 `onModuleDestroy`，既覆盖类 Provider，也覆盖 `useFactory` 产出的
   * 实例（连接池等），且不会出现类 Provider 被销毁两次。
   */
  async shutdown(): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise
    this.shutdownPromise = this.teardown()
    return this.shutdownPromise
  }

  private async teardown(): Promise<void> {
    if (this.closed) return
    this.closed = true

    for (const plugin of this.plugins) {
      try {
        await plugin.destroy?.(this)
      } catch (err: any) {
        this.logger.error(`Plugin destroy failed: ${err?.message || err}`)
      }
    }

    // 逆序销毁实例并回调 onModuleDestroy（关闭连接 / 定时器），最后才拆桥接
    await this.container.dispose()
    this.ipcBridge?.unregisterAll()
    this.eventBridge?.unregisterAll()
    this.windowManager.destroyAll()
    // 关闭后模块图已无意义，清空避免 getModuleGraph() 返回陈旧快照
    this.scannedModules = []
  }

  private async runPluginReady(plugin: Plugin): Promise<void> {
    if (this.readyPlugins.has(plugin)) return
    this.readyPlugins.add(plugin)
    try {
      await plugin.ready?.(this)
    } catch (err: any) {
      this.logger.error(`Plugin ready failed: ${err?.message || err}`)
    }
  }

  /**
   * `before-quit` 必须 preventDefault 后 await 清理再退出：
   * Electron 不会等待一个返回值是 Promise 的监听器，直接 quit 会让
   * 连接池 / 文件句柄在半路被砍掉。
   */
  private installQuitHook(): void {
    if (this.quitHookInstalled) return
    this.quitHookInstalled = true

    electronApp.on('before-quit', (event?: { preventDefault?: () => void }) => {
      if (this.shutdownDone) return // 清理已完成，放行真正的退出
      event?.preventDefault?.()

      void this.shutdown().finally(() => {
        this.shutdownDone = true
        electronApp.quit()
      })
    })
  }

  /** start 失败时把副作用还原，使修复配置后可以重新 start() */
  private async rollbackStart(err: unknown): Promise<void> {
    this.logger.error(
      `Application start failed, rolling back: ${(err as any)?.message || String(err)}`,
    )

    this.ipcBridge?.unregisterAll()
    this.eventBridge?.unregisterAll()
    this.ipcBridge = undefined
    this.eventBridge = undefined

    try {
      await this.container.dispose()
    } catch (disposeError: any) {
      this.logger.error(`Rollback dispose failed: ${disposeError?.message || disposeError}`)
    }
    // dispose 会标记 unavailable，clear 负责把容器恢复成可重新注册的初始态
    this.container.clear()

    this.windowManager.destroyAll()
    this.lifecycle = undefined
    this.scannedModules = []
  }
}

/**
 * 创建 Application 实例（尚未启动）。
 */
export function createApp(rootModule: Function): Application {
  return new Application(rootModule)
}
