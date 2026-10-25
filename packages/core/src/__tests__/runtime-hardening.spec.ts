import { describe, it, expect, vi } from 'vitest'
import {
  Catch,
  Inject,
  Injectable,
  META,
  IpcHandle,
  Optional,
  UseFilters,
  NotFoundException,
  getClassMetadata,
  type ExceptionFilter,
  type IpcErrorResponse,
} from '@electrum/common'
import { DIContainer } from '../di/container'
import { MiddlewarePipeline } from '../middleware/pipeline'
import { LifecycleManager } from '../lifecycle/manager'
import { WindowManager } from '../window/manager'
import type { ScannedModule } from '../module/scanner'

vi.mock('electron', () => ({
  BrowserWindow: vi.fn().mockImplementation(() => ({
    webContents: { send: vi.fn(), isLoadingMainFrame: () => false },
    loadURL: vi.fn().mockResolvedValue(undefined),
    loadFile: vi.fn().mockResolvedValue(undefined),
    once: vi.fn(),
    on: vi.fn(),
    show: vi.fn(),
    destroy: vi.fn(),
    isDestroyed: vi.fn(() => false),
  })),
}))

function stubModule(overrides: Partial<ScannedModule>): ScannedModule {
  return {
    moduleClass: class {},
    metadata: {},
    controllers: [],
    providers: [],
    declarations: [],
    ...overrides,
  }
}

const injectionKeys = (cls: Function): string[] =>
  ((getClassMetadata(cls)[META.INJECTIONS] as Array<{ propertyKey: string }> | undefined) || []).map(
    (point) => point.propertyKey,
  )

describe('decorator metadata inheritance', () => {
  class Base {
    @Inject('base-token') base!: unknown
  }

  it('keeps the parent injection list untouched when a child adds its own', () => {
    class Child extends Base {
      @Inject('child-token') child!: unknown
    }

    expect(injectionKeys(Base)).toEqual(['base'])
    expect(injectionKeys(Child)).toEqual(['base', 'child'])
  })

  it('does not turn the parent @Inject into optional when the child uses @Optional', () => {
    class OptBase {
      @Inject('base-token') base!: unknown
    }
    class OptChild extends OptBase {
      @Optional()
      @Inject('child-token')
      child!: unknown
    }

    const parentPoint = (
      getClassMetadata(OptBase)[META.INJECTIONS] as Array<{ type: string }>
    )[0]
    const childPoint = (
      getClassMetadata(OptChild)[META.INJECTIONS] as Array<{ propertyKey: string; type: string }>
    ).find((point) => point.propertyKey === 'child')

    expect(parentPoint.type).toBe('service')
    expect(childPoint?.type).toBe('optional')
    expect(injectionKeys(OptBase)).toEqual(['base'])
  })
})

describe('resolveAsync visibility', () => {
  it('does not let a concurrent in-flight resolve bypass module exports', async () => {
    const container = new DIContainer()
    class ModA {}
    class ModB {}

    container.registerModule(ModA, {})
    container.registerModule(ModB, { imports: [ModA] })
    container.register('SECRET', { useFactory: async () => 'secret', owner: ModA })

    const owner = container.resolveAsync('SECRET', ModA)
    const intruder = container.resolveAsync('SECRET', ModB)

    await expect(owner).resolves.toBe('secret')
    await expect(intruder).rejects.toThrow(/not visible/)
  })
})

describe('useValue registration', () => {
  it('accepts an explicit undefined value', () => {
    const container = new DIContainer()
    container.register('PLACEHOLDER', { useValue: undefined })

    expect(container.resolve('PLACEHOLDER')).toBeUndefined()
  })
})

describe('request scope at the IPC boundary', () => {
  @Injectable()
  class RequestContext {
    userId = 7
    role = 'admin'
  }

  @Injectable()
  class Consumer {
    @Inject(RequestContext) ctx!: RequestContext
  }

  @Injectable()
  class RequestController {
    @Inject(Consumer) consumer!: Consumer

    @IpcHandle('whoami')
    whoami() {
      return { ctx: this.consumer.ctx }
    }
  }

  it('unwraps the proxy so the result is enumerable and structured-cloneable', async () => {
    const container = new DIContainer()
    container.register(RequestContext, { useClass: RequestContext, scope: 'request' })
    container.register(Consumer, { useClass: Consumer })
    container.register(RequestController, { useClass: RequestController })

    const instance = container.resolve<RequestController>(RequestController)
    const pipeline = new MiddlewarePipeline(container)

    const result = await container.runInRequestScopeAsync(() =>
      pipeline.execute({
        type: 'handle',
        instance,
        method: 'whoami',
        controllerClass: RequestController,
        channel: 'req:whoami',
        event: {},
        args: [],
      }),
    )

    expect(Object.keys(result.ctx)).toEqual(['userId', 'role'])
    expect(() => structuredClone(result)).not.toThrow()
    expect(structuredClone(result).ctx.userId).toBe(7)
  })
})

describe('filter dispatch by @Catch type', () => {
  @Catch(NotFoundException)
  class NotFoundFilter implements ExceptionFilter {
    catch(): IpcErrorResponse {
      return { __error: true, code: 'NOT_FOUND_FILTER', message: 'not found filter' }
    }
  }

  @Catch()
  class CatchAllFilter implements ExceptionFilter {
    catch(): IpcErrorResponse {
      return { __error: true, code: 'CATCH_ALL', message: 'catch all' }
    }
  }

  @Injectable()
  class FilterController {
    @UseFilters(NotFoundFilter)
    notFound() {
      throw new NotFoundException('gone')
    }

    @UseFilters(NotFoundFilter)
    plain() {
      throw new Error('plain')
    }

    @UseFilters(CatchAllFilter)
    anything() {
      throw new Error('whatever')
    }
  }

  async function run(method: string) {
    const container = new DIContainer()
    container.register(FilterController, { useClass: FilterController })
    container.register(NotFoundFilter, { useClass: NotFoundFilter })
    container.register(CatchAllFilter, { useClass: CatchAllFilter })
    const pipeline = new MiddlewarePipeline(container)

    return pipeline.execute({
      type: 'handle',
      instance: container.resolve<FilterController>(FilterController),
      method,
      controllerClass: FilterController,
      channel: `filter:${method}`,
      event: {},
      args: [],
    })
  }

  it('uses the filter whose @Catch matches the thrown exception', async () => {
    await expect(run('notFound')).resolves.toMatchObject({ code: 'NOT_FOUND_FILTER' })
  })

  it('falls back to built-in serialization when no filter matches', async () => {
    await expect(run('plain')).resolves.toMatchObject({ code: 'INTERNAL' })
  })

  it('treats a filter without @Catch as catch-all', async () => {
    await expect(run('anything')).resolves.toMatchObject({ code: 'CATCH_ALL' })
  })
})

describe('lifecycle ordering', () => {
  const order: string[] = []

  @Injectable()
  class ServiceA {
    async onModuleInit() {
      order.push('init:A')
    }
    async onModuleDestroy() {
      order.push('destroy:A')
    }
  }

  @Injectable()
  class ServiceB {
    async onModuleInit() {
      order.push('init:B')
    }
    async onModuleDestroy() {
      order.push('destroy:B')
    }
  }

  it('runs init serially and destroys in reverse order', async () => {
    order.length = 0
    const container = new DIContainer()
    container.register(ServiceA, { useClass: ServiceA })
    container.register(ServiceB, { useClass: ServiceB })

    const lifecycle = new LifecycleManager(container, [
      stubModule({ providers: [ServiceA] }),
      stubModule({ providers: [ServiceB] }),
    ])

    await lifecycle.runHook('onModuleInit')
    await lifecycle.runHook('onModuleDestroy')

    expect(order).toEqual(['init:A', 'init:B', 'destroy:B', 'destroy:A'])
  })
})

describe('window manager dedupe', () => {
  it('reuses a live window instead of leaking a second one', () => {
    const container = new DIContainer()
    const manager = new WindowManager(container)

    const first = manager.createWindow({ name: 'main' })
    const second = manager.createWindow({ name: 'main' })

    expect(second).toBe(first)
    expect(manager.getAllWindows()).toHaveLength(1)
  })
})
