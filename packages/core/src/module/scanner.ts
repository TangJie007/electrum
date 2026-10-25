import { META, readMetadata, type ModuleMetadata, type Provider } from '@electrum/common'
import { DIContainer, formatToken, type Token } from '../di/container'

/**
 * 单个模块扫描结果快照。
 * Application 后续用它来：建窗（declarations）、绑 IPC（controllers）、跑生命周期等。
 */
export interface ScannedModule {
  /** 模块类本身，如 AppModule */
  moduleClass: Function
  /** @Module({...}) 写入的原始元数据 */
  metadata: ModuleMetadata
  /** 本模块声明的 Controller 类列表 */
  controllers: Function[]
  /** 本模块注册过的「类形态」Provider（函数 Provider + useClass） */
  providers: Function[]
  /** 窗口声明类（@WindowDeclaration），供 WindowManager 使用 */
  declarations: Function[]
}

/**
 * 模块扫描器：从根 @Module 出发，深度优先遍历 imports 树。
 *
 * 副作用：边扫边向 DIContainer 注册 providers / controllers，并登记模块
 * 的 imports / exports 关系（用于 exports 可见性校验）。
 * 调用时机：Application.start() 最开始（Electron ready 之前即可扫完）。
 *
 * 设计说明见 docs/core/module-scanner.md
 */
export class ModuleScanner {
  /** 已访问模块，防止 A imports B、B imports A 时死递归 */
  private visited = new Set<Function>()

  /** 扫描产出的有序列表（子模块在前、父模块在后，因 DFS 先走 imports） */
  private results: ScannedModule[] = []

  /** 模块 → 它自己声明的 Provider token（静态校验用） */
  private declaredTokens = new Map<Function, Set<Token>>()

  constructor(private container: DIContainer) {}

  /**
   * 从根模块开始扫描。
   * @param rootModule 通常是 AppModule 类（必须带 @Module）
   * @throws 模块图不合法时（imports 不是 @Module、exports 了没提供/没导入的东西）
   */
  scan(rootModule: Function): ScannedModule[] {
    this.walk(rootModule)
    this.validateGraph()
    return this.results
  }

  /**
   * 启动期静态校验：把「运行时才会炸」的模块图错误提前到 start() 第一步。
   *
   * 能查出来的问题：
   * - `exports` 了本模块及其 imports 都没提供过的 token（否则要到注入时才报 not visible）
   * - `exports: [OtherModule]` 却没 import 那个模块（转发语义不成立）
   *
   * `imports` 里放了没有 `@Module` 的类由 `walk()` 直接拦下；
   * 同名 token 被多个模块各自 provide 是合法且隔离的，不在校验范围内。
   */
  private validateGraph(): void {
    const problems: string[] = []

    for (const { moduleClass, metadata } of this.results) {
      for (const exported of metadata.exports || []) {
        if (this.isModule(exported)) {
          if (!this.reaches(moduleClass, exported)) {
            problems.push(
              `${moduleClass.name} re-exports module ${exported.name} but never imports it`,
            )
          }
          continue
        }

        if (!this.providesTransitively(moduleClass, exported, new Set())) {
          problems.push(
            `${moduleClass.name} exports ${formatToken(exported)} which is not provided by ` +
              `itself or any module it imports`,
          )
        }
      }
    }

    if (problems.length > 0) {
      throw new Error(
        `Module graph validation failed:\n- ${problems.join('\n- ')}\n\n` +
          `Fix the @Module metadata (imports / exports) or run ` +
          `app.getModuleGraph() to inspect the graph.`,
      )
    }
  }

  private isModule(value: unknown): value is Function {
    return typeof value === 'function' && !!readMetadata(value, META.MODULE)
  }

  /** from 是否（直接或间接）imports 了 target */
  private reaches(from: Function, target: Function): boolean {
    const stack = [from]
    const seen = new Set<Function>()

    while (stack.length > 0) {
      const current = stack.pop()!
      if (seen.has(current)) continue
      seen.add(current)

      const metadata = readMetadata<ModuleMetadata>(current, META.MODULE)
      for (const imported of metadata?.imports || []) {
        if (imported === target) return true
        stack.push(imported)
      }
    }

    return false
  }

  /** moduleClass 自己或它 imports 的模块里，是否有谁提供了该 token */
  private providesTransitively(
    moduleClass: Function,
    token: Token,
    seen: Set<Function>,
  ): boolean {
    if (seen.has(moduleClass)) return false
    seen.add(moduleClass)

    if (this.declaredTokens.get(moduleClass)?.has(token)) return true

    const metadata = readMetadata<ModuleMetadata>(moduleClass, META.MODULE)
    for (const imported of metadata?.imports || []) {
      if (this.providesTransitively(imported, token, seen)) return true
    }

    return false
  }

  /**
   * DFS 核心：
   * 1. visited 去重
   * 2. 读 META.MODULE，没有则报错
   * 3. 登记本模块的 imports / exports
   * 4. 先递归 imports（让依赖模块的 Provider 先入容器）
   * 5. 注册本模块 providers / controllers（带上 owner 模块）
   * 6. 推入 results
   */
  private walk(moduleClass: Function): void {
    if (this.visited.has(moduleClass)) return
    this.visited.add(moduleClass)

    const metadata = readMetadata<ModuleMetadata>(moduleClass, META.MODULE)

    if (!metadata) {
      throw new Error(`${moduleClass.name} is not decorated with @Module`)
    }

    // 先登记模块关系，再递归，保证子模块注册 Provider 时可见性表已就绪
    this.container.registerModule(moduleClass, metadata)

    // 先扫子模块，保证「被导入模块」的 Provider 先于本模块注册
    for (const imported of metadata.imports || []) {
      this.walk(imported)
    }

    const providerClasses: Function[] = []
    for (const provider of metadata.providers || []) {
      this.registerProvider(provider, providerClasses, moduleClass)
    }

    // Controller 也要进容器，IpcBridge 里 resolve(Controller) 才能属性注入
    for (const controller of metadata.controllers || []) {
      this.container.register(controller, { useClass: controller, owner: moduleClass })
    }

    this.results.push({
      moduleClass,
      metadata,
      controllers: metadata.controllers || [],
      providers: providerClasses,
      declarations: metadata.declarations || [],
    })
  }

  /** 记录某模块声明过的 token（静态校验 exports 用） */
  private declare(owner: Function, token: Token): void {
    let tokens = this.declaredTokens.get(owner)
    if (!tokens) {
      tokens = new Set()
      this.declaredTokens.set(owner, tokens)
    }
    tokens.add(token)
  }

  /** 读取 @Injectable({ scope })；未标注时交给容器默认（singleton） */
  private readScope(cls: Function): 'singleton' | 'transient' | 'request' | undefined {
    const injectableMeta = readMetadata<{ scope: 'singleton' | 'transient' | 'request' }>(
      cls,
      META.INJECTABLE,
    )
    return injectableMeta?.scope
  }

  /**
   * 按 Nest 风格的四种 Provider 形态注册到 DI。
   * - 类：直接 useClass，scope 来自 @Injectable
   * - useValue / useClass / useFactory：自定义 provide token
   *
   * @param owner 归属模块，供 exports 可见性校验使用
   */
  private registerProvider(
    provider: Provider,
    providerClasses: Function[],
    owner: Function,
  ): void {
    if (provider == null) {
      throw new Error(`Invalid provider in module ${owner.name}: provider is ${provider}`)
    }

    if (typeof provider === 'function') {
      this.container.register(provider, {
        useClass: provider,
        scope: this.readScope(provider),
        owner,
      })
      this.declare(owner, provider)
      providerClasses.push(provider)
      return
    }

    if ('useValue' in provider) {
      this.container.register(provider.provide, {
        useValue: provider.useValue,
        scope: provider.scope,
        owner,
      })
      this.declare(owner, provider.provide)
      return
    }

    if ('useClass' in provider) {
      this.container.register(provider.provide, {
        useClass: provider.useClass,
        // 显式 scope 优先；否则继承 `useClass` 上的 @Injectable({ scope })
        scope: provider.scope ?? this.readScope(provider.useClass),
        owner,
      })
      this.declare(owner, provider.provide)
      providerClasses.push(provider.useClass)
      return
    }

    if ('useFactory' in provider) {
      this.container.register(provider.provide, {
        useFactory: provider.useFactory,
        inject: provider.inject,
        // 工厂函数没有 @Injectable 元数据，作用域只能在 provider 上声明
        scope: provider.scope,
        owner,
      })
      this.declare(owner, provider.provide)
      return
    }

    throw new Error(
      `Invalid provider in module ${owner.name}: expected a class or an object with one of ` +
        `useValue / useClass / useFactory`,
    )
  }
}
