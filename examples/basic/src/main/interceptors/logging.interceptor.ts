import { Injectable } from 'electron-mvc'
import type { NestInterceptor, IpcContext } from 'electron-mvc'

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  async intercept(context: IpcContext, next: () => Promise<any>) {
    const start = Date.now()
    const result = await next()
    console.log(`[IPC] ${context.channel} ${Date.now() - start}ms`)
    return result
  }
}
