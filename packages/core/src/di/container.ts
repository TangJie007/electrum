import { AsyncLocalStorage } from 'node:async_hooks'
import {
  META,
  readMetadata,
  Logger,
  type InjectionPoint,
  type InjectionToken,
  type Scope,
} from '@electrum/common'
import { ModuleRegistry, type ModuleRelations } from './module-registry'

/**
 * 可被注入 / 注册的标识：类、字符串、symbol，
 * 或 `createInjectionToken<T>()` 生成的带类型 token。
 */
export type Token = InjectionToken<any>

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

/** `tryResolveCircular` 的「未成环」哨兵；用 Symbol 而非 undefined，避免与值为 undefined 的 Provider 混淆 */
const NO_CYCLE = Symbol('electrum:di:no-cycle')

type WindowSender = (target: string, channel: string, ...args: any[]) => void

/**
 * 把「怎么解析一个 token」参数化，让同步 / 异步两条路径共用同一套注入分派逻辑。
 *
 * 同步实现传 `resolveInternal`，异步实现传 `resolveAsyncInternal`；
 * 后者的返回值可能是 Promise，由调用方 `await`。
 */
type ResolveFn = (token: Token, fromModule: Function | undefined, chain: Token[]) => any

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
  /**
   * 实例缓存以 **Provider 记录** 为键而不是 token。
   *
   * 同一个 token（尤其是字符串 token）可能被多个模块各自 provide，Nest 语义下
   * 它们是不同的 Provider、各有独立实例；用 token 做键会让后注册的模块覆盖前者，
   * A 模块注入到 B 模块的实现。
   */
  private singletons = new Map<ProviderRecord, any>()
  /** token → 该 token 的全部注册记录（每个归属模块一条，`owner === undefined` 为全局记录） */
  private providers = new Map<Token, ProviderRecord[]>()
  /**
   * 异步工厂的 in-flight 结果。
   * 并发的 `resolveAsync` 命中同一 Provider 时直接复用，避免重复建连接池 / 重复 IO。
   */
  private pending = new Map<ProviderRecord, Promise<any>>()
  /** 未 register 的类按 useClass 回退时使用的隐式记录（保证 singleton 语义） */
  private implicit = new Map<Function, ProviderRecord>()
  /** 容器创建的 singleton，按创建顺序记录，dispose 时逆序销毁 */
  private created: Array<{ token: Token; instance: any }> = []
  private externalResolvers: ExternalResolver[] = []
  private moduleRegistry = new ModuleRegistry()
  private circularStrategy: CircularStrategy = 'throw'
  private requestStorage = new AsyncLocalStorage<Map<ProviderRecord, any>>()
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
   *
   * 记录按**归属模块**分开存放（Phase 2）：
   * - 带 `owner` → 替换该模块上一次注册的同一 token（模块内覆盖）
   * - 不带 `owner` → 替换「全局记录」，对所有模块生效（`@electrum/testing` 的
   *   overrideProvider 走这条路径，保持全局覆盖语义）
   *
   * 覆盖一定生成**新记录对象**：实例缓存以记录为键，旧实例自然失效
   * （`created` 里仍保留它，dispose 时照常销毁）。
   */
  register(token: Token, options: ProviderOptions = {}): void {
    const record: ProviderRecord = {
      token,
      useClass: options.useClass,
      useValue: options.useValue,
      hasValue: Object.hasOwn(options, 'useValue'),
      useFactory: options.useFactory,
      inject: options.inject,
      scope: options.scope || 'singleton',
      owner: options.owner,
    }

    const list = this.providers.get(token)
    if (!list) {
      this.providers.set(token, [record])
      return
    }

    const index = list.findIndex((entry) => entry.owner === record.owner)
    if (index >= 0) list[index] = record
    else list.push(record)
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
  resolve<T = any>(token: InjectionToken<T>, fromModule?: Function): T {
    this.assertNotDisposed()
    return this.resolveInternal<T>(token as Token, fromModule, [])
  }

  private resolveInternal<T>(token: Token, fromModule: Function | undefined, chain: Token[]): T {
    const external = this.findExternalResolver(token)
    if (external) return external.resolve(token) as T

    const record = this.recordFor(token, fromModule)
    if (!record) throw this.notFoundError(token, fromModule)

    if (this.singletons.has(record)) return this.singletons.get(record)

    // useValue：常量 / 配置对象，无构造过程（含显式 undefined）
    if (record.hasValue) {
      if (record.scope === 'singleton') this.singletons.set(record, record.useValue)
      return record.useValue
    }

    // 已有异步构建在进行：同步路径再构造一次会产出重复的 singleton
    if (this.pending.has(record)) {
      throw new Error(
        `Provider ${formatToken(token)} is being resolved asynchronously right now. ` +
          `Await that resolveAsync() call instead of mixing resolve() into it.`,
      )
    }

    // useFactory：先按 inject 顺序解析依赖，再把结果交给工厂
    if (record.useFactory) {
      // request 作用域：同一次请求内复用同一个产物（工厂也要有作用域语义）
      if (record.scope === 'request') {
        const cached = this.readRequestCache(record)
        if (cached.hit) return cached.value
      }
      return this.buildFactory<T>(token, record, fromModule, chain)
    }

    // request 作用域：返回代理，每次访问落到「当前请求」的实例
    if (record.scope === 'request' && this.hasClassTarget(token, record)) {
      return this.createRequestProxy<T>(token, record, fromModule)
    }

    return this.buildInstance<T>(token, record, fromModule, chain)
  }

  /**
   * 异步解析：与 `resolve()` 语义一致，但支持返回 Promise 的 `useFactory`。
   * 应用启动（Application.start）与 IPC 运行时都走这条路径。
   */
  async resolveAsync<T = any>(token: InjectionToken<T>, fromModule?: Function): Promise<T> {
    this.assertNotDisposed()
    return this.resolveAsyncInternal<T>(token as Token, fromModule, [])
  }

  private async resolveAsyncInternal<T>(
    token: Token,
    fromModule: Function | undefined,
    chain: Token[],
  ): Promise<T> {
    const external = this.findExternalResolver(token)
    if (external) return external.resolve(token) as T

    const record = this.recordFor(token, fromModule)
    if (!record) throw this.notFoundError(token, fromModule)

    if (this.singletons.has(record)) return this.singletons.get(record)

    if (record.hasValue) {
      if (record.scope === 'singleton') this.singletons.set(record, record.useValue)
      return record.useValue
    }

    // 环依赖判定必须早于 in-flight 复用：否则 A → B → A 会 await 自己的 Promise 而死锁
    const circular = this.tryResolveCircular<T>(token, record, chain)
    if (circular !== NO_CYCLE) return circular

    if (record.scope === 'request' && this.hasClassTarget(token, record)) {
      return this.createRequestProxy<T>(token, record, fromModule)
    }

    // request 作用域：同一请求内复用工厂产物
    if (record.scope === 'request') {
      const cached = this.readRequestCache(record)
      if (cached.hit) return cached.value
    }

    // 同一 Provider 的并发异步解析只构建一次。
    // transient 的语义是「每次解析一个新实例」，request 属于「每次请求一个」，
    // 跨请求共用 in-flight Promise 会把上一个请求的实例泄漏给下一个，因此都不去重。
    if (record.scope !== 'transient' && record.scope !== 'request') {
      const inflight = this.pending.get(record)
      if (inflight) return inflight
    }

    const task = record.useFactory
      ? this.buildFactoryAsync<T>(token, record, fromModule, chain)
      : this.buildInstanceAsync<T>(token, record, fromModule, chain)

    if (record.scope === 'transient') return task

    if (record.scope === 'request') {
      return this.writeRequestCache(record, await task)
    }

    this.pending.set(record, task)
    try {
      return await task
    } finally {
      this.pending.delete(record)
    }
  }

  /** 同步工厂构建：先按 inject 顺序解析依赖（必须全为同步值），再把结果交给工厂 */
  private buildFactory<T>(
    token: Token,
    record: ProviderRecord,
    fromModule: Function | undefined,
    chain: Token[],
  ): T {
    // 工厂的 inject 列表同样可能成环（A.inject=[B] / B.inject=[A]），
    // 不检测就会一路递归到栈溢出，这里与类路径共用同一条解析链
    const circular = this.tryResolveCircular<T>(token, record, chain)
    if (circular !== NO_CYCLE) return circular

    // Provider 的依赖要按「它自己所属模块」校验可见性，而不是按调用方
    const owner = record.owner ?? fromModule

    chain.push(token)
    let instance: any
    try {
      const args = (record.inject || []).map((dep) =>
        this.assertSyncValue(this.resolveInternal(dep, owner, chain), dep),
      )
      instance = this.assertSyncValue(record.useFactory!(...args), token)
    } finally {
      chain.pop()
    }

    const built = this.cacheBuilt<T>(token, record, instance)
    // request 作用域：异步路径由 resolveAsyncInternal 统一回写，同步路径在这里补上
    return record.scope === 'request' ? this.writeRequestCache(record, built) : built
  }

  /** 异步工厂构建：先按 inject 顺序解析依赖，再把结果交给工厂 */
  private async buildFactoryAsync<T>(
    token: Token,
    record: ProviderRecord,
    fromModule: Function | undefined,
    chain: Token[],
  ): Promise<T> {
    const owner = record.owner ?? fromModule

    chain.push(token)
    try {
      const args: any[] = []
      for (const dep of record.inject || []) {
        args.push(await this.resolveAsyncInternal(dep, owner, chain))
      }

      return this.cacheBuilt<T>(token, record, await record.useFactory!(...args))
    } finally {
      chain.pop()
    }
  }

  /** 同步构建类实例 + 属性注入 */
  private buildInstance<T>(
    token: Token,
    record: ProviderRecord,
    fromModule: Function | undefined,
    chain: Token[],
  ): T {
    const targetClass = this.targetClassOf(token, record)
    if (!targetClass) throw this.notFoundError(token, fromModule)

    // 属性注入允许「先建壳再填字段」，因此环依赖可以复用未填充完成的实例
    const circular = this.tryResolveCircular<T>(token, record, chain)
    if (circular !== NO_CYCLE) return circular

    const scope = record.scope
    const owner = record.owner ?? fromModule
    // 只有开启环依赖容错时才提前入缓存，让内层能拿到未填充完成的实例
    const earlyCache = scope === 'singleton' && this.circularStrategy === 'resolve'
    const resolve: ResolveFn = (dep, depOwner, depChain) =>
      this.resolveInternal(dep, depOwner, depChain)

    chain.push(token)
    let instance: any
    try {
      // 构造放在 try 内：构造函数抛错时也要回滚 chain 与缓存
      instance = new (targetClass as any)()
      if (earlyCache) this.singletons.set(record, instance)

      const { injections, ctx } = this.readInjections(targetClass, owner)
      for (const injection of injections) {
        const value = this.applyInjection(injection, ctx, chain, resolve)
        if (value !== SKIP) instance[injection.propertyKey] = value
      }
    } catch (err) {
      if (earlyCache) this.singletons.delete(record)
      throw err
    } finally {
      chain.pop()
    }

    // 容器只接管 singleton 的生命周期；transient / request 由持有者或作用域负责
    return this.cacheBuilt<T>(token, record, instance)
  }

  /** 异步构建类实例 + 属性注入（依赖可能是异步工厂） */
  private async buildInstanceAsync<T>(
    token: Token,
    record: ProviderRecord,
    fromModule: Function | undefined,
    chain: Token[],
  ): Promise<T> {
    const targetClass = this.targetClassOf(token, record)
    if (!targetClass) throw this.notFoundError(token, fromModule)

    const circular = this.tryResolveCircular<T>(token, record, chain)
    if (circular !== NO_CYCLE) return circular

    const scope = record.scope
    const owner = record.owner ?? fromModule
    const earlyCache = scope === 'singleton' && this.circularStrategy === 'resolve'
    const resolve: ResolveFn = (dep, depOwner, depChain) =>
      this.resolveAsyncInternal(dep, depOwner, depChain)

    chain.push(token)
    let instance: any
    try {
      instance = new (targetClass as any)()
      if (earlyCache) this.singletons.set(record, instance)

      const { injections, ctx } = this.readInjections(targetClass, owner)
      for (const injection of injections) {
        const value = await this.applyInjection(injection, ctx, chain, resolve)
        if (value !== SKIP) instance[injection.propertyKey] = value
      }
    } catch (err) {
      if (earlyCache) this.singletons.delete(record)
      throw err
    } finally {
      chain.pop()
    }

    // 容器只接管 singleton 的生命周期；transient / request 由持有者或作用域负责
    return this.cacheBuilt<T>(token, record, instance)
  }

  // ───────────────────────── 构建路径共用片段 ─────────────────────────

  /** 该 Provider 最终要实例化的类；取不到说明既没 `useClass`、token 也不是类 */
  private targetClassOf(token: Token, record: ProviderRecord): Function | null {
    return record.useClass || (typeof token === 'function' ? token : null)
  }

  /**
   * 环依赖分派：未成环返回 `NO_CYCLE`；成环时按策略复用「未填充完成」的实例或抛错。
   *
   * 类路径与工厂路径共用：工厂的 `inject` 链同样会成环（A.inject=[B] / B.inject=[A]），
   * 不检测就会一路递归到栈溢出。早期同步工厂路径只抛错、不认 `resolve` 策略，
   * 与类路径行为不一致，这里统一掉。
   */
  private tryResolveCircular<T>(
    token: Token,
    record: ProviderRecord,
    chain: Token[],
  ): T | typeof NO_CYCLE {
    if (!chain.includes(token)) return NO_CYCLE
    if (this.circularStrategy === 'resolve' && this.singletons.has(record)) {
      return this.singletons.get(record) as T
    }
    throw this.circularError(token, chain)
  }

  /**
   * 构建完成后的收尾：singleton 入缓存并纳入销毁顺序。
   *
   * 四条构建路径（同步/异步 × 类/工厂）共用。transient 不入缓存；
   * request 的回写由各自的解析入口负责（异步在 `resolveAsyncInternal`，
   * 同步在 `buildFactory`），因为类形态的 request Provider 走的是代理路径。
   */
  private cacheBuilt<T>(token: Token, record: ProviderRecord, instance: any): T {
    if (record.scope === 'singleton') {
      this.singletons.set(record, instance)
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

  /**
   * 解析单个注入点的值（window / emit / optional / 普通 token 四种形态）。
   *
   * 同步与异步路径共用这一份分派逻辑 —— 差异只在「最后一步怎么解析 token」，
   * 因此把解析函数作为参数传入。异步路径下返回值可能是 Promise，由调用方 await。
   */
  private applyInjection(
    injection: InjectionPoint,
    ctx: InjectionContext,
    chain: Token[],
    resolve: ResolveFn,
  ): any {
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
      return resolve(injection.token, ctx.owner, chain)
    }

    return resolve(injection.token, ctx.owner, chain)
  }

  // ───────────────────────── request 作用域 ─────────────────────────

  /** 在请求作用域内执行 fn；作用域内解析到的 request-scoped 实例彼此共享 */
  runInRequestScope<T>(fn: () => T): T {
    return this.requestStorage.run(new Map<ProviderRecord, any>(), fn)
  }

  /** 同 `runInRequestScope`，但在结束后销毁本次请求创建的实例 */
  async runInRequestScopeAsync<T>(fn: () => T | Promise<T>): Promise<T> {
    const store = new Map<ProviderRecord, any>()
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
          `Request-scoped provider ${formatToken(token)} was accessed outside of a request scope. ` +
            `Wrap the call with container.runInRequestScope() — IPC handlers do this automatically.`,
        )
      }
      if (!store.has(record)) {
        // 每次请求独立一条解析链，互不干扰；按 Provider 记录隔离同名 token
        store.set(record, this.buildInstance(token, record, fromModule, []))
      }
      return store.get(record)
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

  private async disposeScopeInstances(store: Map<ProviderRecord, any>): Promise<void> {
    // 与创建顺序相反地销毁：后建的先拆，避免先拆掉被依赖的一方
    const instances = [...store.values()].reverse()
    store.clear()
    await this.disposeInstances(instances)
  }

  // ───────────────────────────── 销毁 ─────────────────────────────

  /**
   * 逆序销毁容器创建的实例。
   *
   * 依次尝试 `onModuleDestroy()` → `dispose()` → `onDispose()`：
   * 前两者是 Nest / 本框架通用的清理钩子；`onDispose` 兼容早期写法。
   *
   * 工厂（`useFactory`）产出的实例同样被 track，因此连接池这类资源即使
   * 不是类 Provider 也能被正确释放。
   */
  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true

    // 逆创建序：后建的先拆，避免先拆掉被依赖的一方
    await this.disposeInstances(this.created.map((entry) => entry.instance).reverse())

    this.created = []
    this.singletons.clear()
    this.pending.clear()
    this.implicit.clear()
  }

  /**
   * 依次销毁一组实例，每个实例按 `onModuleDestroy` → `dispose` → `onDispose` 尝试。
   *
   * 单个实例抛错只记录、不打断其余销毁 —— 清理阶段抛出等于放弃后面所有资源。
   */
  private async disposeInstances(instances: unknown[]): Promise<void> {
    for (const instance of instances) {
      for (const disposeFn of this.pickDisposeFns(instance)) {
        try {
          await disposeFn()
        } catch (err: any) {
          this.logger.error(`Dispose failed: ${err?.message || err}`)
        }
      }
    }
  }

  private pickDisposeFns(instance: any): Array<() => any> {
    if (instance == null) return []

    const fns: Array<() => any> = []
    if (typeof instance.onModuleDestroy === 'function') {
      fns.push(() => instance.onModuleDestroy())
    }
    if (typeof instance.dispose === 'function') fns.push(() => instance.dispose())
    if (typeof instance.onDispose === 'function') fns.push(() => instance.onDispose())
    return fns
  }

  // ───────────────────────────── 查询 ─────────────────────────────

  /** 该 token 是否已有 singleton 实例（用于「只销毁已创建实例」这类场景） */
  isInstantiated(token: Token): boolean {
    const list = this.providers.get(token)
    if (list?.some((record) => this.singletons.has(record))) return true

    const implicit = typeof token === 'function' ? this.implicit.get(token) : undefined
    return !!implicit && this.singletons.has(implicit)
  }

  /**
   * 该 token 的作用域；未注册的类按 singleton 处理。
   *
   * 同名 token 可能被多个模块以不同 scope 注册，这里取最后注册的一条
   * （中间件预编译只需要一个保守判断：非 singleton 一律不缓存实例）。
   */
  getScope(token: Token): Scope {
    const list = this.providers.get(token)
    return list?.[list.length - 1]?.scope ?? 'singleton'
  }

  /** 是否「注册过」该 token（不含未 register 的 Class 回退） */
  has(token: Token): boolean {
    if (this.findExternalResolver(token)) return true
    if (this.providers.has(token)) return true
    return typeof token === 'function' && this.implicit.has(token)
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
    this.implicit.clear()
    this.created = []
    this.moduleRegistry.reset()
    this.disposed = false
  }

  /** 模块可见性注册表（模块图导出 / 调试用） */
  getModuleRegistry(): ModuleRegistry {
    return this.moduleRegistry
  }

  /** 某模块注册的 Provider（同名 token 在别的模块注册的那条不会被混进来） */
  getModuleProviders(moduleClass: Function): Array<{ token: Token; scope: Scope }> {
    const result: Array<{ token: Token; scope: Scope }> = []
    for (const [token, list] of this.providers) {
      for (const record of list) {
        if (record.owner === moduleClass) result.push({ token, scope: record.scope })
      }
    }
    return result
  }

  /** 依赖图结构化数据，便于测试与自定义输出 */
  getDependencyGraph(): DependencyNode[] {
    const nodes: DependencyNode[] = []

    for (const [token, list] of this.providers) {
      for (const record of list) {
        const dependencies: string[] = []

        if (record.useFactory) {
          for (const dep of record.inject || []) dependencies.push(formatToken(dep))
        } else {
          const targetClass = this.targetClassOf(token, record)
          if (targetClass) {
            const injections =
              readMetadata<InjectionPoint[]>(targetClass, META.INJECTIONS) || []
            for (const injection of injections) {
              dependencies.push(
                injection.type === 'window'
                  ? `@WindowRef(${injection.windowName})`
                  : formatToken(injection.token),
              )
            }
          }
        }

        nodes.push({
          token: formatToken(token),
          scope: record.scope,
          owner: record.owner?.name || '',
          dependencies,
        })
      }
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
   * 选出生效的 Provider 记录（模块级隔离的核心）。
   *
   * 优先级：
   * 1. 全局记录（`owner === undefined`）：手工 `register` / testing override，对所有模块生效
   * 2. 消费方模块自己注册的记录
   * 3. 消费方可见（exports / `@Global()` / 转发）的其他模块记录
   * 4. 没有 `fromModule`（`app.resolve` 等内部调用）时取最后注册的一条
   *
   * 都不可见时**抛错**而不是回退到 class 构造，否则 exports 校验会被绕过。
   */
  private selectRecord(token: Token, fromModule?: Function): ProviderRecord | undefined {
    const list = this.providers.get(token)
    if (!list || list.length === 0) return undefined

    for (let i = list.length - 1; i >= 0; i--) {
      if (!list[i].owner) return list[i]
    }

    if (!fromModule) return list[list.length - 1]

    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].owner === fromModule) return list[i]
    }

    for (const record of list) {
      if (record.owner && this.moduleRegistry.canSee(fromModule, record.owner, token)) {
        return record
      }
    }

    throw this.visibilityError(token, fromModule, list)
  }

  /** 未 register 的类按 useClass 构造时使用的隐式记录（保证 singleton 语义） */
  private implicitRecord(token: Token): ProviderRecord | undefined {
    if (typeof token !== 'function') return undefined

    let record = this.implicit.get(token)
    if (!record) {
      record = { token, useClass: token, hasValue: false, scope: 'singleton' }
      this.implicit.set(token, record)
    }
    return record
  }

  /** 解析用记录：优先已注册记录，其次未注册类的回退记录 */
  private recordFor(token: Token, fromModule?: Function): ProviderRecord | undefined {
    return this.selectRecord(token, fromModule) ?? this.implicitRecord(token)
  }

  private visibilityError(
    token: Token,
    fromModule: Function,
    list: ProviderRecord[],
  ): Error {
    const declaredIn = list
      .map((record) => record.owner?.name || '<manual>')
      .join(', ')
    return new Error(
      `Provider ${formatToken(token)} is not visible from ${fromModule.name}. ` +
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
        `Provider ${formatToken(token)} resolved to a Promise. ` +
          `Use container.resolveAsync() instead of container.resolve().`,
      )
    }
    return value
  }

  /** 读取当前请求作用域里缓存的实例；无作用域时视为未命中 */
  private readRequestCache(record: ProviderRecord): { hit: boolean; value?: any } {
    const store = this.requestStorage.getStore()
    if (!store || !store.has(record)) return { hit: false }
    return { hit: true, value: store.get(record) }
  }

  /** 把实例写进当前请求作用域（无作用域时原样返回，退化为 transient） */
  private writeRequestCache(record: ProviderRecord, instance: any): any {
    this.requestStorage.getStore()?.set(record, instance)
    return instance
  }

  private notFoundError(token: Token, fromModule?: Function): Error {
    const where = fromModule
      ? ` (required by ${fromModule.name})`
      : ''
    return new Error(
      `No provider found for token: ${formatToken(token)}${where}. ` +
        `Add it to the "providers" array of a @Module` +
        (fromModule ? ` imported by ${fromModule.name}` : '') +
        `. Current graph:\n${this.printDependencyGraph(GRAPH_PREVIEW_LIMIT)}`,
    )
  }

  private circularError(token: Token, chain: Token[]): Error {
    const path = [...chain, token].map((t) => formatToken(t)).join(' → ')
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
    return this.targetClassOf(token, record) !== null
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error('DIContainer has been disposed and can no longer resolve providers')
    }
  }

}

/** token 的可读表示：类名 / `"字符串"` / `Symbol(...)` */
export function formatToken(token: Token): string {
  if (typeof token === 'function') return token.name || '<anonymous>'
  if (typeof token === 'string') return `"${token}"`
  return String(token)
}
