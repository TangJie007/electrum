import { app } from 'electron'
import { META, readMetadata } from '../constants/metadata-keys'
import type { DIContainer } from '../di/container'
import type { ScannedModule } from '../module/scanner'
import { Logger } from '../logger/logger'
import type { AppEventEntry } from '../decorators/app-event.decorator'

export class EventBridge {
  private logger = new Logger('EventBridge')

  constructor(
    private container: DIContainer,
    private scannedModules: ScannedModule[],
  ) {}

  registerAll(): void {
    for (const mod of this.scannedModules) {
      for (const cls of [...mod.controllers, ...mod.providers]) {
        this.bindEvents(cls)
      }
    }
  }

  private bindEvents(targetClass: Function): void {
    const handlers = readMetadata<AppEventEntry[]>(targetClass, META.APP_EVENT) || []
    if (handlers.length === 0) return

    const instance = this.container.resolve<any>(targetClass)

    for (const { event, method } of handlers) {
      app.on(event as any, (...args: any[]) => {
        try {
          const result = instance[method](...args)
          if (result instanceof Promise) {
            result.catch((err: Error) =>
              this.logger.error(`AppEvent "${event}" error: ${err.message}`),
            )
          }
        } catch (err: any) {
          this.logger.error(`AppEvent "${event}" error: ${err.message}`)
        }
      })

      this.logger.debug(`Bound app.on("${event}") → ${targetClass.name}.${String(method)}`)
    }
  }
}
