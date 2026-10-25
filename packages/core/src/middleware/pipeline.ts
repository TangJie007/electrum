import {
  META,
  readMetadata,
  Logger,
  ForbiddenException,
  ElectronException,
  type CanActivate,
  type IpcContext,
  type NestInterceptor,
  type PipeTransform,
  type PipeContext,
  type ExceptionFilter,
  type IpcErrorResponse,
  type MethodMiddlewareEntry,
} from '@electrum/common'
import { unwrapRequestScope, type DIContainer } from '../di/container'

export interface PipelineExecutionContext {
  type: 'handle' | 'on'
  instance: any
  method: string | symbol
  controllerClass: Function
  channel: string
  event: any
  args: any[]
}

/**
 * 编译期就绪的中间件。
 *
 * singleton 在首次编译时解析好实例并缓存 —— IPC 每次调用都不再走
 * `readMetadata` + `container.resolveAsync`；request / transient 作用域的
 * 中间件保留类引用，运行时按请求解析。
 */
interface PlannedMiddleware<T> {
  classRef: Function
  instance?: T
}

/** 单个 channel 的执行计划（guards / pipes / interceptors / filters 已按顺序摊平） */
export interface PipelinePlan {
  guards: Array<PlannedMiddleware<CanActivate>>
  pipes: Array<PlannedMiddleware<PipeTransform>>
  interceptors: Array<PlannedMiddleware<NestInterceptor>>
  filters: Array<PlannedMiddleware<ExceptionFilter>>
  /** 生成该计划时的全局中间件版本；之后追加全局中间件会让旧计划自动失效 */
  version: number
}

export class MiddlewarePipeline {
  private logger = new Logger('Pipeline')
  private globalFilters: Function[] = []
  private globalGuards: Function[] = []
  private globalPipes: Function[] = []
  private globalInterceptors: Function[] = []

  /** 全局中间件版本：任何一次追加都 +1，旧计划随之失效 */
  private version = 0

  /** Controller → method → 已编译计划（Promise 缓存，并发首次调用也只编译一次） */
  private plans = new WeakMap<
    Function,
    Map<string | symbol, { version: number; plan: Promise<PipelinePlan> }>
  >()

  constructor(private container: DIContainer) {}

  useGlobalFilters(...filters: Function[]): void {
    this.globalFilters.push(...filters)
    this.version++
  }
  useGlobalGuards(...guards: Function[]): void {
    this.globalGuards.push(...guards)
    this.version++
  }
  useGlobalPipes(...pipes: Function[]): void {
    this.globalPipes.push(...pipes)
    this.version++
  }
  useGlobalInterceptors(...interceptors: Function[]): void {
    this.globalInterceptors.push(...interceptors)
    this.version++
  }

  async execute(ctx: PipelineExecutionContext, plan?: PipelinePlan): Promise<any> {
    // 注意：先建 context 再编译，保证编译阶段抛错也能落到 Filter
    const context: IpcContext = {
      channel: ctx.channel,
      event: ctx.event,
      args: ctx.args,
      controllerClass: ctx.controllerClass,
      instance: ctx.instance,
    }

    let compiled = plan
    try {
      compiled ??= await this.compile(ctx.controllerClass, ctx.method)
      await this.runGuards(compiled, context)
      const transformedArgs = await this.runPipes(compiled, context)
      // Pipe 变换后的参数必须回写，否则 Interceptor / Filter 读到的仍是原始入参
      context.args = transformedArgs
      const result = await this.runWithInterceptors(ctx, compiled, context, transformedArgs)
      // Electron 返回值走结构化克隆，而它拒绝 Proxy：出口前先把 request 作用域代理展开
      return unwrapRequestScope(result)
    } catch (err) {
      return await this.runFilters(err, context, ctx.method, compiled, ctx.controllerClass)
    }
  }

  async executeGuardOnly(ctx: PipelineExecutionContext, plan?: PipelinePlan): Promise<void> {
    const context: IpcContext = {
      channel: ctx.channel,
      event: ctx.event,
      args: ctx.args,
      controllerClass: ctx.controllerClass,
      instance: ctx.instance,
    }
    try {
      const compiled = plan ?? (await this.compile(ctx.controllerClass, ctx.method))
      await this.runGuards(compiled, context)
      // @IpcOn 的约定：首参是 IpcMainEvent（可用 event.reply 回消息）
      await ctx.instance[ctx.method](ctx.event, ...ctx.args)
    } catch (err) {
      this.logger.error(`Guard/method error on "${ctx.channel}": ${err}`)
    }
  }

  /**
   * 编译某个 Controller 方法的完整中间件链。
   *
   * 结果按类 + 方法名缓存；`Promise` 也一并缓存，避免并发的首批 IPC 调用
   * 各自解析一遍中间件实例。
   */
  compile(controllerClass: Function, method: string | symbol): Promise<PipelinePlan> {
    let byMethod = this.plans.get(controllerClass)
    if (!byMethod) {
      byMethod = new Map()
      this.plans.set(controllerClass, byMethod)
    }

    const cached = byMethod.get(method)
    if (cached && cached.version === this.version) return cached.plan

    // 编译失败（依赖缺失等）不能把失败的 Promise 永久缓存，否则修复后也永远报同一个错
    const plan = this.buildPlan(controllerClass, method).catch((err) => {
      byMethod!.delete(method)
      throw err
    })
    byMethod.set(method, { version: this.version, plan })
    return plan
  }

  private async buildPlan(controllerClass: Function, method: string | symbol): Promise<PipelinePlan> {
    const readMethod = (key: PropertyKey): Function[] =>
      (readMetadata<MethodMiddlewareEntry[]>(controllerClass, key) || []).find(
        (entry) => entry.method === method,
      )?.middlewares || []

    const guards = [
      ...this.globalGuards,
      ...(readMetadata<Function[]>(controllerClass, META.CLASS_GUARDS) || []),
      ...readMethod(META.METHOD_GUARDS),
    ]
    const pipes = [
      ...this.globalPipes,
      ...(readMetadata<Function[]>(controllerClass, META.CLASS_PIPES) || []),
      ...readMethod(META.METHOD_PIPES),
    ]
    const interceptors = [
      ...this.globalInterceptors,
      ...(readMetadata<Function[]>(controllerClass, META.CLASS_INTERCEPTORS) || []),
      ...readMethod(META.METHOD_INTERCEPTORS),
    ]
    // Filter 的优先级是反的：方法级最内层，全局兜底
    const filters = [
      ...readMethod(META.METHOD_FILTERS),
      ...(readMetadata<Function[]>(controllerClass, META.CLASS_FILTERS) || []),
      ...this.globalFilters,
    ]

    return {
      guards: await Promise.all(guards.map((cls) => this.planMiddleware<CanActivate>(cls))),
      pipes: await Promise.all(pipes.map((cls) => this.planMiddleware<PipeTransform>(cls))),
      interceptors: await Promise.all(
        interceptors.map((cls) => this.planMiddleware<NestInterceptor>(cls)),
      ),
      filters: await Promise.all(filters.map((cls) => this.planMiddleware<ExceptionFilter>(cls))),
      version: this.version,
    }
  }

  private async planMiddleware<T>(classRef: Function): Promise<PlannedMiddleware<T>> {
    // request / transient 的中间件每次请求都应是新实例，不能缓存
    if (this.container.getScope(classRef) !== 'singleton') return { classRef }
    return { classRef, instance: (await this.container.resolveAsync<T>(classRef)) as T }
  }

  private async resolvePlanned<T>(planned: PlannedMiddleware<T>): Promise<T> {
    if (planned.instance !== undefined) return planned.instance
    return (await this.container.resolveAsync(planned.classRef)) as T
  }

  private async runGuards(plan: PipelinePlan, context: IpcContext): Promise<void> {
    for (const planned of plan.guards) {
      const guard = await this.resolvePlanned(planned)
      const canActivate = await guard.canActivate(context)
      if (!canActivate) {
        throw new ForbiddenException(
          `Guard ${planned.classRef.name} denied access to "${context.channel}"`,
        )
      }
    }
  }

  /**
   * 依次执行 Pipe，**逐个参数**变换。
   *
   * 早期实现只处理 `args[0]`，多参处理器的其余参数完全绕过校验/转换。
   * IPC 没有参数类型元数据，因此改为全部参数都过一遍，并在 context 里暴露
   * `index` / `argCount`；只关心首参的 Pipe 用 `context.index !== 0` 跳过即可。
   *
   * 注：`context.args` 指向正在被改写的数组，Pipe 能看到同一轮里前面参数的结果。
   */
  private async runPipes(plan: PipelinePlan, context: IpcContext): Promise<any[]> {
    const args = [...context.args]
    const argCount = args.length

    for (const planned of plan.pipes) {
      const pipe = await this.resolvePlanned(planned)
      for (let index = 0; index < argCount; index++) {
        const pipeContext: PipeContext = { ...context, args, index, argCount }
        args[index] = await pipe.transform(args[index], pipeContext)
      }
    }

    return args
  }

  private async runWithInterceptors(
    ctx: PipelineExecutionContext,
    plan: PipelinePlan,
    context: IpcContext,
    args: any[],
  ): Promise<any> {
    const executeController = () => Promise.resolve(ctx.instance[ctx.method](...args))

    if (plan.interceptors.length === 0) return executeController()

    // 洋葱模型：先按顺序解析好实例，再从内向外包
    const interceptors: NestInterceptor[] = []
    for (const planned of plan.interceptors) interceptors.push(await this.resolvePlanned(planned))

    let chain = executeController
    for (let i = interceptors.length - 1; i >= 0; i--) {
      const interceptor = interceptors[i]
      const next = chain
      chain = () => interceptor.intercept(context, next)
    }
    return chain()
  }

  /**
   * 异常分派：按 `@Catch()` 声明的类型从内向外匹配，取第一个命中的 Filter。
   * 没有 `@Catch` 的 Filter 视为 catch-all。
   */
  private async runFilters(
    exception: unknown,
    context: IpcContext,
    method: string | symbol,
    plan: PipelinePlan | undefined,
    controllerClass: Function,
  ): Promise<IpcErrorResponse> {
    let filters = plan?.filters
    if (!filters) {
      // 计划编译失败（例如中间件自身依赖缺失）时，至少把 Filter 编译出来兜底
      filters = await this.compile(controllerClass, method)
        .then((compiled) => compiled.filters)
        .catch(() => [])
    }

    for (const planned of filters) {
      if (!this.matches(exception, planned.classRef)) continue
      try {
        const filter = await this.resolvePlanned(planned)
        return await filter.catch(exception, context)
      } catch (filterError) {
        // Filter 自己炸了：记录后继续找下一个，最终回落到内置处理
        this.logger.error(
          `Filter ${planned.classRef.name} failed on "${context.channel}": ${filterError}`,
        )
      }
    }

    if (exception instanceof ElectronException) {
      return exception.toJSON()
    }

    if (exception instanceof Error) {
      return {
        __error: true,
        code: 'INTERNAL',
        message: exception.message,
        ...(process.env.NODE_ENV?.includes('dev') ? { stack: exception.stack } : {}),
      }
    }
    return { __error: true, code: 'UNKNOWN', message: 'An unknown error occurred' }
  }

  private matches(exception: unknown, filterClass: Function): boolean {
    const types = readMetadata<Function[]>(filterClass, META.CATCH)
    // 未声明 @Catch（或 @Catch() 空列表）= catch-all
    if (!types || types.length === 0) return true
    if (exception === null || typeof exception !== 'object') return false
    return types.some((type) => exception instanceof type)
  }
}
