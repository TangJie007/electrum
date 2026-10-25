import { META, readMetadata, type ModuleMetadata, type Provider } from '@electrum/common'
import { DIContainer, type Token } from '../di/container'

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
  /** 对外导出的 token / 模块白名单；未声明时为 undefined（模块私有，与 Nest 一致） */
  exports?: Token[]
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

  constructor(private container: DIContainer) {}

  /**
   * 从根模块开始扫描。
   * @param rootModule 通常是 AppModule 类（必须带 @Module）
   */
  scan(rootModule: Function): ScannedModule[] {
    this.walk(rootModule)
    return this.results
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
      exports: metadata.exports,
    })
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
    if (typeof provider === 'function') {
      this.container.register(provider, {
        useClass: provider,
        scope: this.readScope(provider),
        owner,
      })
      providerClasses.push(provider)
    } else if ('useValue' in provider) {
      this.container.register(provider.provide, { useValue: provider.useValue, owner })
    } else if ('useClass' in provider) {
      this.container.register(provider.provide, {
        useClass: provider.useClass,
        // `{ provide: TOKEN, useClass: Service }` 也要继承 Service 上的 @Injectable({ scope })
        scope: this.readScope(provider.useClass),
        owner,
      })
      providerClasses.push(provider.useClass)
    } else if ('useFactory' in provider) {
      this.container.register(provider.provide, {
        useFactory: provider.useFactory,
        inject: provider.inject,
        owner,
      })
    }
  }
}
