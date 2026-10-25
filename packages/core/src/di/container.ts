import { AsyncLocalStorage } from 'node:async_hooks'
import {
  META,
  readMetadata,
  Logger,
  type InjectionPoint,
  type Scope,
} from '@electrum/common'
import { ModuleRegistry, type ModuleRelations } from './module-registry'

/** 可被注入 / 注册的标识：类、字符串或 symbol */
export type Token = Function | string | symbol

/** `register()` 的可选项 */
export interface ProviderOptions {
  useClass?: Function
  useValue?: any
  /**
   * 工厂函数。允许返回 Promise —— 但必须用 `resolveAsync()` 解析，
   * 否则同步 `resolve()` 会抛出明确错误（而不是把 Promise 当成实例注入）。
   */
  useFactory?: (...args: any[]) => any
  /** `useFactory` 的依赖 token 列表，按顺序作为工厂入参 */
  inject?: Token[]
  scope?: Scope
  /** 归属模块；配合 `@Module({ exports })` 做可见性隔离 */
  owner?: Function
}

interface ProviderRecord {
  token: Token
  useClass?: Function
  useValue?: any
  /**
   * 是否显式提供了 `useValue`。
   *
   * 不能靠 `useValue !== undefined` 判断：`{ useValue: undefined }` 是合法配置
   * （占位 / 测试 mock），用值判断会把它误当成「没有 useValue」而走进构造流程。
   */
  hasValue: boolean
  useFactory?: (...args: any[]) => any
  inject?: Token[]
  scope: Scope
  owner?: Function
  /** 注册过该 token 的全部模块；同名 token 被多个模块注册时，各模块自己始终可见 */
  owners?: Set<Function>
}

/**
 * 外部解析器：把「容器本身不认识的 token」交给框架层处理。
 *
 * 用于解耦 Electron 专属语义（如 `@WindowRef` 写入的 `electrum:window:*` token），
 * 让 `DIContainer` 保持为一个与 Electron 无关的纯 DI 组件。
 */
export interface ExternalResolver {
  canResolve(token: Token): boolean
  resolve(token: Token): unknown
}

/** 遇到环依赖时的处理策略：`throw` 抛错（默认），`resolve` 复用未填充完成的实例 */
export type CircularStrategy = 'throw' | 'resolve'

/** 依赖图节点，供诊断输出使用 */
export interface DependencyNode {
  token: string
  scope: Scope
  owner: string
  dependencies: string[]
}

const WINDOW_TOKEN_PREFIX = 'electrum:window:'

/** 报错信息里最多展示的依赖图节点数，避免巨型图把错误刷成几十屏 */
const GRAPH_PREVIEW_LIMIT = 40

/** 注入阶段的「跳过赋值」哨兵（@Optional 且 token 不存在） */
const SKIP = Symbol('electrum:di:skip')

type WindowSender = (target: string, channel: string, ...args: any[]) => void

/** 属性注入时的上下文 */
interface InjectionContext {
  /** 消费方模块，用于 exports 可见性校验 */
  owner?: Function
  /** @Controller 的 prefix，用于拼 @IpcEmit 完整通道 */
  prefix: string
  controllerWindow?: string
  /** 宿主类名，仅用于错误信息 */
  targetName: string
}

/**
 * Electrum 的 DI 容器。
 *
 * 采用 **属性注入**：先无参 `new`，再按 `Symbol.metadata` 上的 `META.INJECTIONS`
 * 逐个填字段（Stage 3 没有参数装饰器，无法做构造注入）。
 *
 * 解析来源优先级：
 * 1. 外部解析器（`electrum:window:*` 等框架 token）
 * 2. 已缓存的 singleton / request 实例
 * 3. Provider（useValue / useFactory / useClass）
 * 4. 直接把 Class 当 token（未 register 时按 useClass 处理）
 */
/** request 作用域代理的内部标记；用 Symbol.for 保证跨模块副本一致 */
export const REQUEST_SCOPE_PROXY = Symbol.for('electrum:request-scope-proxy')

/**
 * 把（可能嵌套的）request 作用域代理展开成普通对象。
 *
 * V8 的 `structuredClone` 一律拒绝 Proxy（报 "could not be cloned"），
 * 而 Electron IPC 的返回值必须可结构化克隆 —— 只补 ownKeys 还不够，
 * 出口处必须真正把代理读成数据。
 *
 * 只重建「普通对象 / 数组 / 代理」，Date / Map / Buffer 等内建类型原样返回，
 * 交给结构化克隆自己处理。
 */
export function unwrapRequestScope<T>(value: T, depth = 0): T {
  if (value === null || typeof value !== 'object') return value
  if (depth > 32) return value

  const source = value as any

  if (source[REQUEST_SCOPE_PROXY] === true) {
    const plain: Record<string, unknown> = {}
    for (const key of Object.keys(source)) {
      plain[key] = unwrapRequestScope(source[key], depth + 1)
    }
    return plain as T
  }

  if (Array.isArray(value)) {
    let changed = false
    const next = value.map((item) => {
      const unwrapped = unwrapRequestScope(item, depth + 1)
      if (unwrapped !== item) changed = true
      return unwrapped
    })
    return (changed ? next : value) as T
  }

  const proto = Object.getPrototypeOf(value)
  if (proto === Object.prototype || proto === null) {
    let changed = false
    const plain: Record<string, unknown> = {}
    for (const key of Object.keys(value)) {
      const original = source[key]
      const unwrapped = unwrapRequestScope(original, depth + 1)
      if (unwrapped !== original) changed = true
      plain[key] = unwrapped
    }
    return (changed ? plain : value) as T
  }

  return value
}

export class DIContainer {
  private singletons = new Map<Token, any>()
  private providers = new Map<Token, ProviderRecord>()
  /**
   * 异步工厂的 in-flight 结果。
   * 并发的 `resolveAsync` 命中同一 token 时直接复用，避免重复建连接池 / 重复 IO。
   */
  private pending = new Map<Token, Promise<any>>()
  /** 容器创建的 singleton，按创建顺序记录，dispose 时逆序销毁 */
  private created: Array<{ token: Token; instance: any }> = []
  private externalResolvers: ExternalResolver[] = []
  private moduleRegistry = new ModuleRegistry()
  private circularStrategy: CircularStrategy = 'throw'
  private requestStorage = new AsyncLocalStorage<Map<Token, any>>()
  private windowProvider: (name: string) => any | undefined = () => undefined
  private windowSender: WindowSender = () => undefined
  private disposed = false
  private logger = new Logger('DIContainer')

  constructor() {
    // 窗口 token 下沉为「外部解析器」，容器本身不再关心 Electron
    this.externalResolvers.push({
      canResolve: (token) =>
        typeof token === 'symbol' &&
        (token.description || '').startsWith(WINDOW_TOKEN_PREFIX),
      resolve: (token) => {
        const description = typeof token === 'symbol' ? token.description || '' : ''
        const name = description.slice(WINDOW_TOKEN_PREFIX.length)
        const win = this.windowProvider(name)
        if (!win) throw new Error(`Window "${name}" not found`)
        return win
      },
    })
  }

  // ───────────────────────────── 注册 ─────────────────────────────

  /**
   * 注册一个 Provider。
   * 同一 token 重复注册会覆盖上一次（`@electrum/testing` 的 override 基于此）。
   *
   * 覆盖时保留历史 `owners`，让「多个模块各自 providers 同一个 token」时
   * 每个模块仍能注入自己注册的服务（实例共享最后一份实现，见文档）。
   */
  register(token: Token, options: ProviderOptions = {}): void {
    // 覆盖注册意味着「换实现」：必须丢掉旧 singleton，否则 override 后仍拿到旧实例。
    // created 里保留旧实例，dispose() 时仍会被逆序销毁。
    this.singletons.delete(token)

    const previous = this.providers.get(token)
    const owners = previous?.owners ?? new Set<Function>()
    if (options.owner) owners.add(options.owner)

    this.providers.set(token, {
      token,
      useClass: options.useClass,
      useValue: options.useValue,
      hasValue: Object.hasOwn(options, 'useValue'),
      useFactory: options.useFactory,
      inject: options.inject,
      scope: options.scope || 'singleton',
      // 覆盖注册（如 testing 的 overrideProvider）不传 owner 时保留原归属，
      // 否则这个 Provider 会退化成「无 owner」而绕过 exports 校验
      owner: options.owner ?? previous?.owner,
      owners,
    })
  }

  /** 登记模块的 imports / exports / global 关系，启用 exports 可见性校验 */
  registerModule(moduleClass: Function, metadata: ModuleRelations): void {
    this.moduleRegistry.register(moduleClass, metadata)
  }

  /** 追加外部解析器（先注册的优先匹配） */
  addExternalResolver(resolver: ExternalResolver): void {
    this.externalResolvers.push(resolver)
  }

  /** 注册窗口取值函数（由 WindowManager 在 app ready 后注入） */
  setWindowProvider(fn: (name: string) => any | undefined): void {
    this.windowProvider = fn
  }

  /** 注册 @IpcEmit 的发送函数；target 为窗口名或 `'broadcast'` */
  setWindowSender(fn: WindowSender): void {
    this.windowSender = fn
  }

  /** 设置环依赖策略。默认 `throw`；`resolve` 会复用未填充完成的实例 */
  setCircularStrategy(strategy: CircularStrategy): void {
    this.circularStrategy = strategy
  }

  // ───────────────────────────── 解析 ─────────────────────────────

  /**
   * 同步解析。图里若存在异步工厂会抛出明确错误，提示改用 `resolveAsync()`。
   *
   * @param token Provider token 或 Class
   * @param fromModule 消费方模块（可选）。提供后会校验 exports 可见性
   */
  resolve<T = any>(token: Token, fromModule?: Function): T {
    this.assertNotDisposed()
    return this.resolveInternal<T>(token, fromModule, [])
  }

  private resolveInternal<T>(token: Token, fromModule: Function | undefined, chain: Token[]): T {
    const external = this.findExternalResolver(token)
    if (external) return external.resolve(token) as T

    if (this.singletons.has(token)) {
      this.assertVisible(token, fromModule)
      return this.singletons.get(token)
    }

    const record = this.providers.get(token)

    // useValue：常量 / 配置对象，无构造过程（含显式 undefined）
    if (record?.hasValue) {
      this.assertVisible(token, fromModule)
      if (record.scope === 'singleton') this.singletons.set(token, record.useValue)
      return record.useValue
    }

    // 已有异步构建在进行：同步路径再构造一次会产出重复的 singleton
    if (this.pending.has(token)) {
      throw new Error(
        `Provider ${this.formatToken(token)} is being resolved asynchronously right now. ` +
          `Await that resolveAsync() call instead of mixing resolve() into it.`,
      )
    }

    // useFactory：先 resolve inject 列表，再调工厂函数
    if (record?.useFactory) {
      this.assertVisible(token, fromModule)

      // 工厂的 inject 列表同样可能成环（A.inject=[B] / B.inject=[A]），
      // 不检测就会一路递归到栈溢出，这里与类路径共用同一条解析链
      if (chain.includes(token)) throw this.circularError(token, chain)

      const owner = this.consumerFor(record, fromModule)
      chain.push(token)
      let instance: any
      try {
        const args = (record.inject || []).map((dep) =>
          this.assertSyncValue(this.resolveInternal(dep, owner, chain), dep),
        )
        instance = this.assertSyncValue(record.useFactory(...args), token)
      } finally {
        chain.pop()
      }

      if (record.scope === 'singleton') {
        this.singletons.set(token, instance)
        this.track(token, instance)
      }
      return instance
    }

    // request 作用域：返回代理，每次访问落到「当前请求」的实例
    if (record?.scope === 'request' && this.hasClassTarget(token, record)) {
      this.assertVisible(token, fromModule)
      return this.createRequestProxy<T>(token, record, fromModule)
    }

    return this.buildInstance<T>(token, record, fromModule, chain)
  }

  /**
   * 异步解析：与 `resolve()` 语义一致，但支持返回 Promise 的 `useFactory`。
   * 应用启动（Application.start）与 IPC 运行时都走这条路径。
   */
  async resolveAsync<T = any>(token: Token, fromModule?: Function): Promise<T> {
    this.assertNotDisposed()
    return this.resolveAsyncInternal<T>(token, fromModule, [])
  }

  private async resolveAsyncInternal<T>(
    token: Token,
    fromModule: Function | undefined,
    chain: Token[],
  ): Promise<T> {
    const external = this.findExternalResolver(token)
    if (external) return external.resolve(token) as T

    if (this.singletons.has(token)) {
      this.assertVisible(token, fromModule)
      return this.singletons.get(token)
    }

    const record = this.providers.get(token)

    if (record?.hasValue) {
      this.assertVisible(token, fromModule)
      if (record.scope === 'singleton') this.singletons.set(token, record.useValue)
      return record.useValue
    }

    // 环依赖判定必须早于 in-flight 复用：否则 A → B → A 会 await 自己的 Promise 而死锁
    if (chain.includes(token)) {
      if (this.circularStrategy === 'resolve' && this.singletons.has(token)) {
        return this.singletons.get(token)
      }
      throw this.circularError(token, chain)
    }

    if (record?.scope === 'request' && this.hasClassTarget(token, record)) {
      this.assertVisible(token, fromModule)
      return this.createRequestProxy<T>(token, record, fromModule)
    }

    const scope = record?.scope ?? 'singleton'

    // 可见性校验必须早于 in-flight 复用：否则 B 模块在 A 模块构建同一 token
    // 期间调用 resolveAsync，会直接拿到 A 的 Promise，绕过 exports 隔离。
    this.assertVisible(token, fromModule)

    // 同一 token 的并发异步解析只构建一次。
    // transient 的语义是「每次解析一个新实例」，因此不参与去重。
    if (scope !== 'transient') {
      const inflight = this.pending.get(token)
      if (inflight) return inflight
    }

    const task = record?.useFactory
      ? this.buildFactoryAsync<T>(token, record, fromModule, chain)
      : this.buildInstanceAsync<T>(token, record, fromModule, chain)

    if (scope === 'transient') return task

    this.pending.set(token, task)
    try {
      return await task
    } finally {
      this.pending.delete(token)
    }
  }

  /** 异步工厂构建：先按 inject 顺序解析依赖，再把结果交给工厂 */
  private async buildFactoryAsync<T>(
    token: Token,
    record: ProviderRecord,
    fromModule: Function | undefined,
    chain: Token[],
  ): Promise<T> {
    const owner = this.consumerFor(record, fromModule)

    chain.push(token)
    try {
      const args: any[] = []
      for (const dep of record.inject || []) {
        args.push(await this.resolveAsyncInternal(dep, owner, chain))
      }

      const instance = await record.useFactory!(...args)
      if (record.scope === 'singleton') {
        this.singletons.set(token, instance)
        this.track(token, instance)
      }
      return instance
    } finally {
      chain.pop()
    }
  }

  /** 同步构建类实例 + 属性注入 */
  private buildInstance<T>(
    token: Token,
    record: ProviderRecord | undefined,
    fromModule: Function | undefined,
    chain: Token[],
  ): T {
    const targetClass = record?.useClass || (typeof token === 'function' ? token : null)
    if (!targetClass) throw this.notFoundError(token, fromModule)

    this.assertVisible(token, fromModule)

    if (chain.includes(token)) {
      // 属性注入允许「先建壳再填字段」，因此环依赖可以复用未填充完成的实例
      if (this.circularStrategy === 'resolve' && this.singletons.has(token)) {
        return this.singletons.get(token)
      }
      throw this.circularError(token, chain)
    }

    const scope = record?.scope || 'singleton'
    const owner = this.consumerFor(record, fromModule)
    // 只有开启环依赖容错时才提前入缓存，让内层能拿到未填充完成的实例
    const earlyCache = scope === 'singleton' && this.circularStrategy === 'resolve'

    chain.push(token)
    let instance: any
    try {
      // 构造放在 try 内：构造函数抛错时也要回滚 chain 与缓存
      instance = new (targetClass as any)()
      if (earlyCache) this.singletons.set(token, instance)

      const { injections, ctx } = this.readInjections(targetClass, owner)
      for (const injection of injections) {
        const value = this.applyInjection(injection, ctx, chain)
        if (value !== SKIP) instance[injection.propertyKey] = value
      }
    } catch (err) {
      if (earlyCache) this.singletons.delete(token)
      throw err
    } finally {
      chain.pop()
    }

    if (scope === 'singleton') {
      this.singletons.set(token, instance)
      // 容器只接管 singleton 的生命周期；transient / request 由持有者或作用域负责
      this.track(token, instance)
    }

    return instance as T
  }

  /** 异步构建类实例 + 属性注入（依赖可能是异步工厂） */
  private async buildInstanceAsync<T>(
    token: Token,
    record: ProviderRecord | undefined,
    fromModule: Function | undefined,
    chain: Token[],
  ): Promise<T> {
    const targetClass = record?.useClass || (typeof token === 'function' ? token : null)
    if (!targetClass) throw this.notFoundError(token, fromModule)

    this.assertVisible(token, fromModule)

    if (chain.includes(token)) {
      if (this.circularStrategy === 'resolve' && this.singletons.has(token)) {
        return this.singletons.get(token)
      }
      throw this.circularError(token, chain)
    }

    const scope = record?.scope || 'singleton'
    const owner = this.consumerFor(record, fromModule)
    const earlyCache = scope === 'singleton' && this.circularStrategy === 'resolve'

    chain.push(token)
    let instance: any
    try {
      instance = new (targetClass as any)()
      if (earlyCache) this.singletons.set(token, instance)

      const { injections, ctx } = this.readInjections(targetClass, owner)
      for (const injection of injections) {
        const value = await this.applyInjectionAsync(injection, ctx, chain)
        if (value !== SKIP) instance[injection.propertyKey] = value
      }
    } catch (err) {
      if (earlyCache) this.singletons.delete(token)
      throw err
    } finally {
      chain.pop()
    }

    if (scope === 'singleton') {
      this.singletons.set(token, instance)
      this.track(token, instance)
    }

    return instance as T
  }

  /** 读取类的注入点并组装注入上下文 */
  private readInjections(
    targetClass: Function,
    owner: Function | undefined,
  ): { injections: InjectionPoint[]; ctx: InjectionContext } {
    const injections = readMetadata<InjectionPoint[]>(targetClass, META.INJECTIONS) || []
    const controllerMeta = readMetadata<{ prefix?: string; window?: string }>(
      targetClass,
      META.CONTROLLER,
    )
    return {
      injections,
      ctx: {
        owner,
        prefix: controllerMeta?.prefix || '',
        controllerWindow: controllerMeta?.window,
        targetName: targetClass.name,
      },
    }
  }

  private applyInjection(injection: InjectionPoint, ctx: InjectionContext, chain: Token[]): any {
    if (injection.type === 'window') {
      const win = this.windowProvider(injection.windowName!)
      if (!win) {
        throw new Error(
          `Window "${injection.windowName}" not found for injection in ${ctx.targetName}`,
        )
      }
      return win
    }

    if (injection.type === 'emit') {
      const channel = injection.emitChannel || ''
      const fullChannel = ctx.prefix ? `${ctx.prefix}:${channel}` : channel
      const target = injection.emitWindow ?? ctx.controllerWindow ?? 'main'
      return (...args: any[]) => {
        this.windowSender(target, fullChannel, ...args)
      }
    }

    if (injection.type === 'optional') {
      if (!this.canResolve(injection.token)) return SKIP
      return this.resolveInternal(injection.token, ctx.owner, chain)
    }

    return this.resolveInternal(injection.token, ctx.owner, chain)
  }

  private async applyInjectionAsync(
    injection: InjectionPoint,
    ctx: InjectionContext,
    chain: Token[],
  ): Promise<any> {
    if (injection.type === 'window') {
      const win = this.windowProvider(injection.windowName!)
      if (!win) {
        throw new Error(
          `Window "${injection.windowName}" not found for injection in ${ctx.targetName}`,
        )
      }
      return win
    }

    if (injection.type === 'emit') {
      const channel = injection.emitChannel || ''
      const fullChannel = ctx.prefix ? `${ctx.prefix}:${channel}` : channel
      const target = injection.emitWindow ?? ctx.controllerWindow ?? 'main'
      return (...args: any[]) => {
        this.windowSender(target, fullChannel, ...args)
      }
    }

    if (injection.type === 'optional') {
      if (!this.canResolve(injection.token)) return SKIP
      return this.resolveAsyncInternal(injection.token, ctx.owner, chain)
    }

    return this.resolveAsyncInternal(injection.token, ctx.owner, chain)
  }

  // ───────────────────────── request 作用域 ─────────────────────────

  /** 在请求作用域内执行 fn；作用域内解析到的 request-scoped 实例彼此共享 */
  runInRequestScope<T>(fn: () => T): T {
    return this.requestStorage.run(new Map<Token, any>(), fn)
  }

  /** 同 `runInRequestScope`，但在结束后销毁本次请求创建的实例 */
  async runInRequestScopeAsync<T>(fn: () => T | Promise<T>): Promise<T> {
    const store = new Map<Token, any>()
    try {
      return await this.requestStorage.run(store, () => Promise.resolve(fn()))
    } finally {
      await this.disposeScopeInstances(store)
    }
  }

  /**
   * request 作用域的 Provider 注入到长生命周期实例（singleton）时，
   * 不能注入固定实例，否则会串请求。这里返回一个代理，
   * 每次属性访问都解析到「当前请求」的实例。
   */
  private createRequestProxy<T>(
    token: Token,
    record: ProviderRecord,
    fromModule?: Function,
  ): T {
    const targetClass = record.useClass || (typeof token === 'function' ? token : null)
    if (!targetClass) throw this.notFoundError(token, fromModule)

    const resolveReal = () => {
      const store = this.requestStorage.getStore()
      if (!store) {
        throw new Error(
          `Request-scoped provider ${this.formatToken(token)} was accessed outside of a request scope. ` +
            `Wrap the call with container.runInRequestScope() — IPC handlers do this automatically.`,
        )
      }
      if (!store.has(token)) {
        // 每次请求独立一条解析链，互不干扰
        store.set(token, this.buildInstance(token, record, fromModule, []))
      }
      return store.get(token)
    }

    const shell = Object.create((targetClass as any).prototype)
    return new Proxy(shell, {
      get(_target, prop) {
        // 标记自身，供 IPC 出口把它展开成普通对象（structuredClone 不接受 Proxy）
        if (prop === REQUEST_SCOPE_PROXY) return true
        // 防止被 `await` / `Promise.resolve()` 当成 thenable 而意外触发解析
        if (prop === 'then') return undefined
        const real = resolveReal()
        return Reflect.get(real, prop, real)
      },
      set(_target, prop, value) {
        return Reflect.set(resolveReal(), prop, value)
      },
      has(_target, prop) {
        return Reflect.has(resolveReal(), prop)
      },
      // ownKeys / getOwnPropertyDescriptor 缺一不可：没有它们，代理在
      // Object.keys / JSON.stringify / structuredClone（Electron IPC 返回值要走
      // 结构化克隆）眼里都是「空对象」，request-scoped 服务一旦作为返回值
      // 直接抛 "could not be cloned"。
      ownKeys() {
        return Reflect.ownKeys(resolveReal())
      },
      getOwnPropertyDescriptor(_target, prop) {
        const descriptor = Reflect.getOwnPropertyDescriptor(resolveReal(), prop)
        // 一律报告为可配置：shell 上没有这些属性，非可配置会违反 Proxy invariant
        return descriptor ? { ...descriptor, configurable: true } : undefined
      },
      getPrototypeOf() {
        return (targetClass as any).prototype
      },
    }) as T
  }

  private async disposeScopeInstances(store: Map<Token, any>): Promise<void> {
    // 与创建顺序相反地销毁：后建的先拆，避免先拆掉被依赖的一方
    const instances = [...store.values()].reverse()
    store.clear()

    for (const instance of instances) {
      const disposeFn = this.pickDisposeFn(instance)
      if (!disposeFn) continue
      try {
        await disposeFn()
      } catch (err: any) {
        this.logger.error(`Request scope dispose failed: ${err?.message || err}`)
      }
    }
  }

  // ───────────────────────────── 销毁 ─────────────────────────────

  /**
   * 逆序销毁容器创建的实例（调用其 `dispose()` 或 `onDispose()`）。
   * Application.shutdown 在 `onModuleDestroy` 之后调用。
   */
  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true

    for (let i = this.created.length - 1; i >= 0; i--) {
      const { instance } = this.created[i]
      const disposeFn = this.pickDisposeFn(instance)
      if (!disposeFn) continue
      try {
        await disposeFn()
      } catch (err: any) {
        this.logger.error(`Dispose failed: ${err?.message || err}`)
      }
    }

    this.created = []
    this.singletons.clear()
    this.pending.clear()
  }

  private pickDisposeFn(instance: any): (() => any) | null {
    if (instance == null) return null
    if (typeof instance.dispose === 'function') return () => instance.dispose()
    if (typeof instance.onDispose === 'function') return () => instance.onDispose()
    return null
  }

  // ───────────────────────────── 查询 ─────────────────────────────

  /** 该 token 是否已有 singleton 实例（用于「只销毁已创建实例」这类场景） */
  isInstantiated(token: Token): boolean {
    return this.singletons.has(token)
  }

  /**
   * 该 token 的作用域；未注册的类按 singleton 处理。
   *
   * 供中间件预编译使用：只有 singleton 才能安全缓存实例，
   * request / transient 必须每次请求重新解析。
   */
  getScope(token: Token): Scope {
    return this.providers.get(token)?.scope ?? 'singleton'
  }

  /** 是否「注册过」该 token（不含未 register 的 Class 回退） */
  has(token: Token): boolean {
    if (this.findExternalResolver(token)) return true
    return this.providers.has(token) || this.singletons.has(token)
  }

  /**
   * 是否「能解析」该 token：在 `has()` 之上再算上 Class 回退
   * （`resolve(SomeClass)` 即使没 register 也能按 useClass 构造）。
   * `@Optional` 用它判断，避免把可构造的类误判为缺失。
   */
  private canResolve(token: Token): boolean {
    return this.has(token) || typeof token === 'function'
  }

  clear(): void {
    this.singletons.clear()
    this.providers.clear()
    this.pending.clear()
    this.created = []
    this.moduleRegistry.reset()
    this.disposed = false
  }

  /** 依赖图结构化数据，便于测试与自定义输出 */
  getDependencyGraph(): DependencyNode[] {
    const nodes: DependencyNode[] = []

    for (const [token, record] of this.providers) {
      const dependencies: string[] = []

      if (record.useFactory) {
        for (const dep of record.inject || []) dependencies.push(this.formatToken(dep))
      } else {
        const targetClass =
          record.useClass || (typeof token === 'function' ? token : null)
        if (targetClass) {
          const injections =
            readMetadata<InjectionPoint[]>(targetClass, META.INJECTIONS) || []
          for (const injection of injections) {
            dependencies.push(
              injection.type === 'window'
                ? `@WindowRef(${injection.windowName})`
                : this.formatToken(injection.token),
            )
          }
        }
      }

      nodes.push({
        token: this.formatToken(token),
        scope: record.scope,
        owner: record.owner?.name || '',
        dependencies,
      })
    }

    return nodes
  }

  /**
   * 打印依赖图，排查「找不到 Provider」时很有用。
   * @param limit 最多输出的 Provider 数（默认全量；报错信息里会用较小值避免刷屏）
   */
  printDependencyGraph(limit = Number.POSITIVE_INFINITY): string {
    const nodes = this.getDependencyGraph()
    if (nodes.length === 0) return 'DI dependency graph: (empty)'

    const shown = nodes.slice(0, limit)
    const lines = [`DI dependency graph (${nodes.length} providers):`]
    for (const node of shown) {
      lines.push(`  ${node.token} [${node.scope}]${node.owner ? ` @ ${node.owner}` : ''}`)
      for (const dep of node.dependencies) lines.push(`      └─ ${dep}`)
    }
    if (shown.length < nodes.length) {
      lines.push(`  ... ${nodes.length - shown.length} more (call printDependencyGraph() for full)`)
    }
    return lines.join('\n')
  }

  // ───────────────────────────── 内部 ─────────────────────────────

  private findExternalResolver(token: Token): ExternalResolver | undefined {
    return this.externalResolvers.find((resolver) => resolver.canResolve(token))
  }

  /**
   * 解析某 Provider 的注入点时，消费方是它所属的模块。
   *
   * 同名 token 被多个模块注册时优先用调用方模块：它的依赖应按真实注册方校验，
   * 而不是被最后注册者「抢走」的 owner。
   */
  private consumerFor(
    record: ProviderRecord | undefined,
    fromModule: Function | undefined,
  ): Function | undefined {
    if (fromModule && record?.owners?.has(fromModule)) return fromModule
    return record?.owner ?? fromModule
  }

  private assertVisible(token: Token, fromModule?: Function): void {
    if (!fromModule) return

    const record = this.providers.get(token)
    if (!record) return

    // 同名 token 被多个模块注册时，注册过它的模块都能注入自己那份（实例共享）
    if (record.owners?.has(fromModule)) return

    // 手工 register 的 Provider 没有归属模块，不做可见性限制
    if (!record.owner) return

    if (this.moduleRegistry.canSee(fromModule, record.owner, token)) return

    // owner 必定也在 owners 里，合并后一定有值
    const declaredIn = [...new Set([...(record.owners ?? []), record.owner])]
      .map((mod) => mod.name)
      .join(', ')
    throw new Error(
      `Provider ${this.formatToken(token)} is not visible from ${fromModule.name}. ` +
        `It is declared in ${declaredIn}; add it to that module's "exports" array ` +
        `and make sure ${fromModule.name} imports it.`,
    )
  }

  /**
   * 同步路径拿到 Promise 时抛错，而不是把 Promise 当成实例注入。
   * 用 `instanceof Promise` 而非取 `.then`，避免触发 request 作用域代理的 get 陷阱。
   */
  private assertSyncValue<T>(value: T, token: Token): T {
    if (value instanceof Promise) {
      throw new Error(
        `Provider ${this.formatToken(token)} resolved to a Promise. ` +
          `Use container.resolveAsync() instead of container.resolve().`,
      )
    }
    return value
  }

  private notFoundError(token: Token, fromModule?: Function): Error {
    const where = fromModule
      ? ` (required by ${fromModule.name})`
      : ''
    return new Error(
      `No provider found for token: ${this.formatToken(token)}${where}. ` +
        `Add it to the "providers" array of a @Module` +
        (fromModule ? ` imported by ${fromModule.name}` : '') +
        `. Current graph:\n${this.printDependencyGraph(GRAPH_PREVIEW_LIMIT)}`,
    )
  }

  private circularError(token: Token, chain: Token[]): Error {
    const path = [...chain, token].map((t) => this.formatToken(t)).join(' → ')
    return new Error(
      `Circular dependency detected: ${path}. ` +
        `Property injection can break the cycle — call container.setCircularStrategy('resolve').`,
    )
  }

  private track(token: Token, instance: any): void {
    if (instance === null || instance === undefined) return
    if (typeof instance !== 'object' && typeof instance !== 'function') return
    // 按实例去重而非 token：覆盖注册后新旧实例都要纳入销毁顺序
    if (this.created.some((entry) => entry.instance === instance)) return
    this.created.push({ token, instance })
  }

  /** 该 Provider 是否能落到「类」上（决定 request 作用域能否用代理代理它） */
  private hasClassTarget(token: Token, record: ProviderRecord): boolean {
    return !!record.useClass || typeof token === 'function'
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error('DIContainer has been disposed and can no longer resolve providers')
    }
  }

  private formatToken(token: Token): string {
    if (typeof token === 'function') return token.name || '<anonymous>'
    if (typeof token === 'string') return `"${token}"`
    return String(token)
  }
}
