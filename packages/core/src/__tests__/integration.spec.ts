import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  Catch,
  Controller,
  Inject,
  Injectable,
  IpcHandle,
  Module,
  NotFoundException,
  UseFilters,
  UseGuards,
  UseInterceptors,
  UsePipes,
  createInjectionToken,
  type CanActivate,
  type ExceptionFilter,
  type IpcContext,
  type IpcErrorResponse,
  type NestInterceptor,
  type PipeContext,
  type PipeTransform,
} from '@electrum/common'
import { createApp, type Application } from '../application'

/**
 * 端到端集成测试：真实 Application + 真实 ModuleScanner / DIContainer /
 * MiddlewarePipeline / IpcBridge，只把 electron 换成内存实现。
 *
 * 覆盖：跨模块注入（含 exports 校验）、异步工厂、request 作用域、
 * Guard → Pipe → Interceptor → Filter 全链路、模块图导出、优雅关闭。
 */

const harness = vi.hoisted(() => ({
  handles: new Map<string, (...args: any[]) => any>(),
  listeners: new Map<string, (...args: any[]) => any>(),
  appHandlers: new Map<string, (...args: any[]) => void>(),
}))

// 这个用例要真正「invoke / emit」到业务处理器，所以 ipcMain 用可运行的内存实现，
// 而不是 spy；只有 BrowserWindow 复用公共 mock（各文件形态一致）。
vi.mock('electron', async () => {
  const { createBrowserWindowMock } = await import('./helpers/electron-mock')
  return {
    app: {
      isPackaged: false,
      on: (event: string, fn: (...args: any[]) => void) => harness.appHandlers.set(event, fn),
      once: (event: string, fn: (...args: any[]) => void) => harness.appHandlers.set(event, fn),
      removeListener: (event: string) => harness.appHandlers.delete(event),
      whenReady: () => Promise.resolve(),
      quit: vi.fn(),
      getPath: () => process.cwd(),
    },
    ipcMain: {
      handle: (channel: string, fn: (...args: any[]) => any) => harness.handles.set(channel, fn),
      removeHandler: (channel: string) => harness.handles.delete(channel),
      on: (channel: string, fn: (...args: any[]) => any) => harness.listeners.set(channel, fn),
      removeListener: (channel: string) => harness.listeners.delete(channel),
      removeAllListeners: vi.fn(),
    },
    BrowserWindow: createBrowserWindowMock(),
  }
})

const CONFIG = createInjectionToken<{ appName: string }>('IntegrationConfig')
const destroyed: string[] = []

@Injectable()
class Database {
  connected = true

  onModuleDestroy() {
    destroyed.push('db')
  }
}

@Injectable({ scope: 'request' })
class RequestContext {
  requestId = 'req-1'
  secret = 'hidden'
}

@Injectable()
class UserService {
  @Inject(CONFIG) config!: { appName: string }
  @Inject('DB') db!: Database
  @Inject(RequestContext) ctx!: RequestContext

  find(id: string) {
    if (id === 'missing') throw new NotFoundException('user not found')
    return {
      id,
      app: this.config.appName,
      connected: this.db.connected,
      request: { id: this.ctx.requestId },
    }
  }
}

@Injectable()
class AuthGuard implements CanActivate {
  canActivate(context: IpcContext): boolean {
    return context.args[0] !== 'forbidden'
  }
}

@Injectable()
class TrimPipe implements PipeTransform {
  transform(value: unknown, context: PipeContext): unknown {
    if (typeof value !== 'string') return value
    return context.index === 0 ? value.trim() : value
  }
}

@Injectable()
class MarkInterceptor implements NestInterceptor {
  async intercept(context: IpcContext, next: () => Promise<any>): Promise<any> {
    const result = await next()
    return { ...result, channel: context.channel }
  }
}

@Catch(NotFoundException)
class NotFoundFilter implements ExceptionFilter {
  catch(exception: NotFoundException): IpcErrorResponse {
    return { __error: true, code: 'USER_NOT_FOUND', message: exception.message }
  }
}

@Controller('integration')
@UseFilters(NotFoundFilter)
class UserController {
  @Inject(UserService) users!: UserService

  @IpcHandle('user:get')
  // 实际 channel 会拼上 Controller 前缀 → 'integration:user:get'
  @UseGuards(AuthGuard)
  @UsePipes(TrimPipe)
  @UseInterceptors(MarkInterceptor)
  get(id: string) {
    return this.users.find(id)
  }
}

@Module({
  providers: [
    { provide: CONFIG, useValue: { appName: 'Electrum' } },
    { provide: 'DB', useFactory: async () => new Database() },
  ],
  exports: [CONFIG, 'DB'],
})
class InfraModule {}

@Module({
  imports: [InfraModule],
  controllers: [UserController],
  providers: [UserService, RequestContext, AuthGuard, TrimPipe, NotFoundFilter],
})
class FeatureModule {}

@Module({ imports: [FeatureModule] })
class IntegrationAppModule {}

/** `@Controller('integration')` + `@IpcHandle('user:get')` → 带前缀的完整 channel */
const CHANNEL = 'integration:user:get'

describe('Application integration', () => {
  let app: Application

  beforeEach(() => {
    harness.handles.clear()
    harness.listeners.clear()
    harness.appHandlers.clear()
    destroyed.length = 0
  })

  afterEach(async () => {
    await app?.shutdown()
  })

  const invoke = (channel: string, ...args: unknown[]) => {
    const handler = harness.handles.get(channel)
    if (!handler) throw new Error(`No IPC handler registered for ${channel}`)
    return handler({} as any, ...args)
  }

  it('runs the whole IPC chain across module boundaries', async () => {
    app = createApp(IntegrationAppModule)
    await app.start()

    expect(harness.handles.has(CHANNEL)).toBe(true)

    const result = await invoke(CHANNEL, '  42  ')

    expect(result).toMatchObject({
      id: '42', // TrimPipe 生效
      app: 'Electrum', // 跨模块 useValue（InfraModule exports）
      connected: true, // 跨模块异步 useFactory
      channel: CHANNEL, // Interceptor 生效
      request: { id: 'req-1' }, // request 作用域 + 代理已展开
    })
    // IPC 返回值要经 structuredClone，不能带 Proxy
    expect(() => structuredClone(result)).not.toThrow()
    expect(Object.keys(result.request)).toEqual(['id'])
  })

  it('routes a @Catch-matched exception to the module filter', async () => {
    app = createApp(IntegrationAppModule)
    await app.start()

    await expect(invoke(CHANNEL, 'missing')).resolves.toMatchObject({
      __error: true,
      code: 'USER_NOT_FOUND',
    })
  })

  it('rejects the call in the guard before touching the handler', async () => {
    app = createApp(IntegrationAppModule)
    await app.start()

    await expect(invoke(CHANNEL, 'forbidden')).resolves.toMatchObject({
      __error: true,
      code: 'FORBIDDEN',
    })
  })

  it('exposes the module graph without instantiating anything else', async () => {
    app = createApp(IntegrationAppModule)
    await app.start()

    const graph = app.getModuleGraph()
    const names = graph.modules.map((mod) => mod.name)

    expect(names).toEqual(
      expect.arrayContaining(['InfraModule', 'FeatureModule', 'IntegrationAppModule']),
    )
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        { from: 'FeatureModule', to: 'InfraModule', kind: 'import' },
        { from: 'IntegrationAppModule', to: 'FeatureModule', kind: 'import' },
      ]),
    )

    const infra = graph.modules.find((mod) => mod.name === 'InfraModule')
    expect(infra?.providers).toEqual(
      expect.arrayContaining([
        { token: 'Symbol(electrum:token:IntegrationConfig)', scope: 'singleton' },
        { token: '"DB"', scope: 'singleton' },
      ]),
    )

    const mermaid = app.printModuleGraph()
    expect(mermaid).toContain('flowchart TD')
    expect(mermaid).toContain('m_FeatureModule --> m_InfraModule')
  })

  it('tears everything down on shutdown and rejects later IPC calls', async () => {
    app = createApp(IntegrationAppModule)
    await app.start()
    await invoke(CHANNEL, '42')

    await app.shutdown()

    expect(harness.handles.has(CHANNEL)).toBe(false)
    expect(destroyed).toEqual(['db'])
    expect(app.getModuleGraph().modules).toEqual([])
  })
})
