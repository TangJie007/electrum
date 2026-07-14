import { ipcMain } from 'electron'
import { META, readMetadata, Logger, type IpcHandlerEntry } from '@electrum/common'
import type { DIContainer } from '../di/container'
import type { ScannedModule } from '../module/scanner'
import type { MiddlewarePipeline } from '../middleware/pipeline'

export class IpcBridge {
  private logger = new Logger('IpcBridge')
  private registeredChannels = new Set<string>()

  constructor(
    private container: DIContainer,
    private scannedModules: ScannedModule[],
    private pipeline: MiddlewarePipeline,
  ) {}

  registerAll(): void {
    for (const mod of this.scannedModules) {
      for (const controllerClass of mod.controllers) {
        this.registerController(controllerClass)
      }
    }
    this.logger.log(`Registered ${this.registeredChannels.size} IPC channels`)
  }

  unregisterAll(): void {
    for (const channel of this.registeredChannels) {
      ipcMain.removeHandler(channel)
      ipcMain.removeAllListeners(channel)
    }
    this.registeredChannels.clear()
  }

  private registerController(controllerClass: Function): void {
    const instance = this.container.resolve(controllerClass)

    const controllerMeta = readMetadata<{ prefix: string }>(controllerClass, META.CONTROLLER)
    const prefix = controllerMeta?.prefix || ''

    const handleMethods = readMetadata<IpcHandlerEntry[]>(controllerClass, META.IPC_HANDLE) || []

    for (const { channel, method, options } of handleMethods) {
      if (options?.devOnly && !process.env.NODE_ENV?.includes('dev')) continue

      const fullChannel = prefix ? `${prefix}:${channel}` : channel

      if (this.registeredChannels.has(fullChannel)) {
        this.logger.warn(`Duplicate IPC channel: ${fullChannel}, skipping`)
        continue
      }

      ipcMain.handle(fullChannel, async (_event, ...args) => {
        return this.pipeline.execute({
          type: 'handle',
          instance,
          method,
          controllerClass,
          channel: fullChannel,
          event: _event,
          args,
        })
      })

      this.registeredChannels.add(fullChannel)
      this.logger.debug(`handle "${fullChannel}" → ${controllerClass.name}.${String(method)}`)
    }

    const onMethods = readMetadata<IpcHandlerEntry[]>(controllerClass, META.IPC_ON) || []

    for (const { channel, method } of onMethods) {
      const fullChannel = prefix ? `${prefix}:${channel}` : channel

      if (this.registeredChannels.has(fullChannel)) {
        this.logger.warn(`Duplicate IPC channel: ${fullChannel}, skipping`)
        continue
      }

      ipcMain.on(fullChannel, (event, ...args) => {
        void this.pipeline.executeGuardOnly({
          type: 'on',
          instance,
          method,
          controllerClass,
          channel: fullChannel,
          event,
          args,
        })
      })

      this.registeredChannels.add(fullChannel)
      this.logger.debug(`on "${fullChannel}" → ${controllerClass.name}.${String(method)}`)
    }
  }
}
