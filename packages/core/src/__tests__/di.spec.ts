import { describe, it, expect, vi } from 'vitest'
import {
  Module,
  Injectable,
  Inject,
  Optional,
  WindowRef,
  Controller,
  IpcEmit,
} from '@electrum/common'
import { DIContainer } from '../di/container'

@Injectable()
class Logger {
  id = Math.random()
}

@Injectable()
class UserService {
  @Inject(Logger)
  logger!: Logger

  tag = 'users'
}

@Injectable({ scope: 'transient' })
class TransientService {
  id = Math.random()
}

@Controller({ prefix: 'demo', window: 'main' })
class EmitController {
  @IpcEmit('saved')
  saved!: (path: string) => void
}

describe('DIContainer', () => {
  it('resolves @Inject property injection', () => {
    const container = new DIContainer()
    container.register(Logger, { useClass: Logger })
    container.register(UserService, { useClass: UserService })

    const users = container.resolve(UserService)

    expect(users.logger).toBeInstanceOf(Logger)
    expect(users.tag).toBe('users')
  })

  it('returns the same singleton instance for repeated resolve', () => {
    const container = new DIContainer()
    container.register(Logger, { useClass: Logger })
    container.register(UserService, { useClass: UserService })

    const a = container.resolve(UserService)
    const b = container.resolve(UserService)
    const logger = container.resolve(Logger)

    expect(a).toBe(b)
    expect(a.logger).toBe(logger)
  })

  it('creates a new instance for transient scope', () => {
    const container = new DIContainer()
    container.register(TransientService, { useClass: TransientService, scope: 'transient' })

    const a = container.resolve(TransientService)
    const b = container.resolve(TransientService)

    expect(a).not.toBe(b)
    expect(a.id).not.toBe(b.id)
  })

  it('supports useValue and useFactory providers', () => {
    const container = new DIContainer()
    container.register('APP_NAME', { useValue: 'electrum' })
    container.register('BANNER', {
      useFactory: (name: string) => `[${name}]`,
      inject: ['APP_NAME'],
    })

    expect(container.resolve('BANNER')).toBe('[electrum]')
  })

  it('detects circular dependencies', () => {
    @Injectable()
    class A {
      @Inject('B')
      b!: unknown
    }
    @Injectable()
    class B {
      @Inject('A')
      a!: unknown
    }

    const container = new DIContainer()
    container.register('A', { useClass: A })
    container.register('B', { useClass: B })

    expect(() => container.resolve('A')).toThrow(/Circular dependency/)
  })

  it('skips @Optional injection when token is not registered', () => {
    @Injectable()
    class OptionalConsumer {
      @Optional()
      @Inject('MISSING')
      missing?: string
    }

    const container = new DIContainer()
    container.register(OptionalConsumer, { useClass: OptionalConsumer })

    const instance = container.resolve(OptionalConsumer)
    expect(instance.missing).toBeUndefined()
  })

  it('resolves @Optional class tokens through the class fallback', () => {
    @Injectable()
    class PlainService {}

    @Injectable()
    class PlainConsumer {
      @Optional()
      @Inject(PlainService)
      dep?: PlainService
    }

    const container = new DIContainer()
    container.register(PlainConsumer, { useClass: PlainConsumer })

    const instance = container.resolve(PlainConsumer)
    expect(instance.dep).toBeInstanceOf(PlainService)
  })

  it('resolves @WindowRef from window provider', () => {
    @Injectable()
    class WindowConsumer {
      @WindowRef('main')
      mainWindow!: { id: number }
    }

    const fakeWindow = { id: 1 }
    const container = new DIContainer()
    container.setWindowProvider((name) => (name === 'main' ? fakeWindow : undefined))
    container.register(WindowConsumer, { useClass: WindowConsumer })

    const instance = container.resolve(WindowConsumer)
    expect(instance.mainWindow).toBe(fakeWindow)
  })

  it('injects @IpcEmit sender using controller prefix and window', () => {
    const sender = vi.fn()
    const container = new DIContainer()
    container.setWindowSender(sender)
    container.register(EmitController, { useClass: EmitController })

    const instance = container.resolve(EmitController)
    instance.saved('/tmp/a.txt')

    expect(sender).toHaveBeenCalledWith('main', 'demo:saved', '/tmp/a.txt')
  })
})

describe('DIContainer — async providers', () => {
  it('awaits an async useFactory in resolveAsync', async () => {
    const container = new DIContainer()
    container.register('CONFIG', { useValue: { env: 'test' } })
    container.register('DB', {
      useFactory: async (config: { env: string }) => ({ env: config.env, ready: true }),
      inject: ['CONFIG'],
    })

    const db = await container.resolveAsync<{ env: string; ready: boolean }>('DB')
    expect(db).toEqual({ env: 'test', ready: true })

    // singleton 缓存的是解析后的值，而不是 Promise
    expect(container.resolve('DB')).toBe(db)
  })

  it('throws a helpful error when sync resolve meets an async factory', () => {
    const container = new DIContainer()
    container.register('ASYNC', { useFactory: async () => 1 })

    expect(() => container.resolve('ASYNC')).toThrow(/resolveAsync/)
  })

  it('resolves a class whose dependency comes from an async factory', async () => {
    @Injectable()
    class Repo {}

    @Injectable()
    class Service {
      @Inject('REPO')
      repo!: Repo
    }

    const container = new DIContainer()
    container.register('REPO', { useFactory: async () => new Repo() })
    container.register(Service, { useClass: Service })

    const svc = await container.resolveAsync<Service>(Service)
    expect(svc.repo).toBeInstanceOf(Repo)
  })

  it('dedupes concurrent resolveAsync calls for the same singleton', async () => {
    let calls = 0
    const container = new DIContainer()
    container.register('SLOW', {
      useFactory: async () => {
        calls++
        await new Promise((r) => setTimeout(r, 1))
        return {}
      },
    })

    const [a, b] = await Promise.all([
      container.resolveAsync('SLOW'),
      container.resolveAsync('SLOW'),
    ])

    expect(a).toBe(b)
    expect(calls).toBe(1)
  })

  it('does not dedupe transient factories', async () => {
    let calls = 0
    const container = new DIContainer()
    container.register('TRANSIENT', {
      scope: 'transient',
      useFactory: async () => ({ n: ++calls }),
    })

    const [a, b] = await Promise.all([
      container.resolveAsync('TRANSIENT'),
      container.resolveAsync('TRANSIENT'),
    ])

    expect(a).not.toBe(b)
    expect(calls).toBe(2)
  })

  it('detects a cycle formed by factory inject lists', async () => {
    const container = new DIContainer()
    container.register('FA', { useFactory: async (b: any) => ({ b }), inject: ['FB'] })
    container.register('FB', { useFactory: async (a: any) => ({ a }), inject: ['FA'] })

    await expect(container.resolveAsync('FA')).rejects.toThrow(/Circular dependency/)
  })

  it('rejects sync resolve while the same provider is building asynchronously', async () => {
    let release!: () => void
    const container = new DIContainer()
    container.register('SLOW', {
      useFactory: () => new Promise((resolve) => (release = () => resolve(1))),
    })

    const pending = container.resolveAsync('SLOW')
    await Promise.resolve()
    expect(() => container.resolve('SLOW')).toThrow(/asynchronously/)

    release()
    await expect(pending).resolves.toBe(1)
  })
})

describe('DIContainer — circular dependency strategy', () => {
  it('detects a cycle formed by sync factory inject lists', () => {
    const container = new DIContainer()
    container.register('SA', { useFactory: (b: any) => ({ b }), inject: ['SB'] })
    container.register('SB', { useFactory: (a: any) => ({ a }), inject: ['SA'] })

    expect(() => container.resolve('SA')).toThrow(/Circular dependency/)
  })

  it('can break a cycle when the strategy is "resolve"', () => {
    // 用字符串 token 避免类之间的前向引用（TDZ）
    @Injectable()
    class CA {
      @Inject('CB')
      b!: any
    }
    @Injectable()
    class CB {
      @Inject('CA')
      a!: any
    }

    const container = new DIContainer()
    container.setCircularStrategy('resolve')
    container.register('CA', { useClass: CA })
    container.register('CB', { useClass: CB })

    const a = container.resolve<CA>('CA')
    const b = container.resolve<CB>('CB')

    expect(a.b).toBe(b)
    expect(b.a).toBe(a)
  })

  it('suggests the strategy in the thrown error', () => {
    @Injectable()
    class OnlyA {
      @Inject('OnlyB')
      b!: any
    }
    @Injectable()
    class OnlyB {
      @Inject('OnlyA')
      a!: any
    }

    const container = new DIContainer()
    container.register('OnlyA', { useClass: OnlyA })
    container.register('OnlyB', { useClass: OnlyB })

    expect(() => container.resolve('OnlyA')).toThrow(/setCircularStrategy/)
  })
})

describe('DIContainer — request scope', () => {
  it('gives each request scope its own instance and disposes it afterwards', async () => {
    let disposedCount = 0

    @Injectable({ scope: 'request' })
    class ReqCtx {
      id = Math.random()
      dispose() {
        disposedCount++
      }
    }

    @Injectable()
    class Consumer {
      @Inject(ReqCtx)
      ctx!: ReqCtx
    }

    const container = new DIContainer()
    container.register(ReqCtx, { useClass: ReqCtx, scope: 'request' })
    container.register(Consumer, { useClass: Consumer })

    const consumer = container.resolve<Consumer>(Consumer)

    let firstId = 0
    await container.runInRequestScopeAsync(async () => {
      firstId = consumer.ctx.id
      // 同一请求内多次访问拿到同一实例
      expect(consumer.ctx.id).toBe(firstId)
    })

    let secondId = 0
    await container.runInRequestScopeAsync(async () => {
      secondId = consumer.ctx.id
    })

    expect(firstId).not.toBe(secondId)
    expect(disposedCount).toBe(2)
  })

  it('throws when a request-scoped provider is used outside a scope', () => {
    @Injectable({ scope: 'request' })
    class Scoped {
      value = 1
    }

    const container = new DIContainer()
    container.register(Scoped, { useClass: Scoped, scope: 'request' })

    const scoped = container.resolve<Scoped>(Scoped)
    expect(() => scoped.value).toThrow(/outside of a request scope/)
  })
})

describe('DIContainer — dispose', () => {
  it('disposes created instances in reverse order and then refuses to resolve', async () => {
    const order: string[] = []

    @Injectable()
    class DA {
      dispose() {
        order.push('DA')
      }
    }
    @Injectable()
    class DB {
      dispose() {
        order.push('DB')
      }
    }

    const container = new DIContainer()
    container.register(DA, { useClass: DA })
    container.register(DB, { useClass: DB })
    container.resolve(DA)
    container.resolve(DB)

    await container.dispose()

    expect(order).toEqual(['DB', 'DA'])
    expect(() => container.resolve(DA)).toThrow(/disposed/)
  })

  it('drops the cached singleton when a token is re-registered', async () => {
    const disposed: string[] = []

    @Injectable()
    class Replaceable {
      dispose() {
        disposed.push('Replaceable')
      }
    }

    const container = new DIContainer()
    container.register(Replaceable, { useClass: Replaceable })
    const first = container.resolve(Replaceable)

    container.register(Replaceable, { useClass: Replaceable })
    const second = container.resolve(Replaceable)

    expect(second).not.toBe(first)

    await container.dispose()
    // 新旧两代实例都要被销毁，避免覆盖注册后泄漏连接
    expect(disposed).toHaveLength(2)
  })

  it('supports onDispose as an alias of dispose', async () => {
    let called = false

    @Injectable()
    class Legacy {
      onDispose() {
        called = true
      }
    }

    const container = new DIContainer()
    container.register(Legacy, { useClass: Legacy })
    container.resolve(Legacy)

    await container.dispose()
    expect(called).toBe(true)
  })
})

describe('DIContainer — diagnostics', () => {
  it('exposes a dependency graph', () => {
    const container = new DIContainer()
    container.register(Logger, { useClass: Logger })
    container.register(UserService, { useClass: UserService })

    const graph = container.getDependencyGraph()
    const userNode = graph.find((n) => n.token === 'UserService')

    expect(userNode).toBeTruthy()
    expect(userNode!.scope).toBe('singleton')
    expect(userNode!.dependencies).toContain('Logger')
    expect(container.printDependencyGraph()).toContain('DI dependency graph')
  })

  it('mentions the requiring module in not-found errors', () => {
    @Module({ providers: [] })
    class SomeModule {}

    const container = new DIContainer()
    container.registerModule(SomeModule, {})

    expect(() => container.resolve('MISSING', SomeModule)).toThrow(/SomeModule/)
  })
})

describe('DIContainer — external resolvers', () => {
  it('delegates unknown tokens to a registered external resolver', () => {
    const TOKEN = Symbol.for('custom:thing')
    const container = new DIContainer()
    container.addExternalResolver({
      canResolve: (token) => token === TOKEN,
      resolve: () => 'from-external',
    })

    expect(container.has(TOKEN)).toBe(true)
    expect(container.resolve(TOKEN)).toBe('from-external')
  })
})
