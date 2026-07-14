import { Logger } from '@electrum/common'
import { app as electronApp } from 'electron'
import { DIContainer } from './di/container'
import { ModuleScanner, type ScannedModule } from './module/scanner'
import { MiddlewarePipeline } from './middleware/pipeline'
import { IpcBridge } from './bridge/ipc-bridge'
import { EventBridge } from './bridge/event-bridge'
import { WindowManager } from './window/manager'
import { LifecycleManager } from './lifecycle/manager'
import { TypeGenerator } from './type-generator/generator'
import type { Plugin } from './plugin/plugin.interface'

export class Application {
  private container = new DIContainer()
  private scannedModules: ScannedModule[] = []
  private pipeline = new MiddlewarePipeline(this.container)
  private windowManager = new WindowManager(this.container)
  private ipcBridge?: IpcBridge
  private eventBridge?: EventBridge
  private lifecycle?: LifecycleManager
  private plugins: Plugin[] = []
  private logger = new Logger('Application')
  private started = false

  constructor(private rootModule: Function) {}

  use(plugin: Plugin): this {
    this.plugins.push(plugin)
    plugin.install(this)
    return this
  }

  useGlobalFilters(...filters: Function[]): this {
    this.pipeline.useGlobalFilters(...filters)
    return this
  }

  useGlobalGuards(...guards: Function[]): this {
    this.pipeline.useGlobalGuards(...guards)
    return this
  }

  useGlobalPipes(...pipes: Function[]): this {
    this.pipeline.useGlobalPipes(...pipes)
    return this
  }

  useGlobalInterceptors(...interceptors: Function[]): this {
    this.pipeline.useGlobalInterceptors(...interceptors)
    return this
  }

  resolve<T>(token: Function | string | symbol): T {
    return this.container.resolve<T>(token)
  }

  getWindowManager(): WindowManager {
    return this.windowManager
  }

  getContainer(): DIContainer {
    return this.container
  }

  generateTypes(outputPath: string): this {
    if (this.scannedModules.length === 0) {
      const scanner = new ModuleScanner(this.container)
      this.scannedModules = scanner.scan(this.rootModule)
    }
    new TypeGenerator(this.scannedModules).generate(outputPath)
    this.logger.log(`Types generated → ${outputPath}`)
    return this
  }

  async start(): Promise<this> {
    if (this.started) return this

    const scanner = new ModuleScanner(this.container)
    this.scannedModules = scanner.scan(this.rootModule)

    await electronApp.whenReady()

    // Windows first so @WindowRef works when resolving controllers
    await this.windowManager.initialize(this.scannedModules)

    this.ipcBridge = new IpcBridge(this.container, this.scannedModules, this.pipeline)
    this.ipcBridge.registerAll()

    this.eventBridge = new EventBridge(this.container, this.scannedModules)
    this.eventBridge.registerAll()

    this.lifecycle = new LifecycleManager(this.container, this.scannedModules)
    await this.lifecycle.runHook('onModuleInit')
    await this.lifecycle.runHook('onAppReady')

    for (const plugin of this.plugins) {
      await plugin.ready?.(this)
    }

    electronApp.on('before-quit', () => {
      void this.shutdown()
    })

    this.started = true
    this.logger.log('Application started')
    return this
  }

  async reload(): Promise<void> {
    this.ipcBridge?.unregisterAll()
    this.container.clear()

    const scanner = new ModuleScanner(this.container)
    this.scannedModules = scanner.scan(this.rootModule)

    await this.windowManager.initialize(this.scannedModules)

    this.ipcBridge = new IpcBridge(this.container, this.scannedModules, this.pipeline)
    this.ipcBridge.registerAll()

    this.lifecycle = new LifecycleManager(this.container, this.scannedModules)
    await this.lifecycle.runHook('onModuleInit')
    await this.lifecycle.runHook('onAppReady')

    this.logger.log('Application reloaded')
  }

  private async shutdown(): Promise<void> {
    for (const plugin of this.plugins) {
      await plugin.destroy?.(this)
    }
    await this.lifecycle?.runHook('onModuleDestroy')
    this.ipcBridge?.unregisterAll()
  }
}

export function createApp(rootModule: Function): Application {
  return new Application(rootModule)
}
