import { META } from '../constants/metadata-keys'

export interface ValueProvider {
  provide: InjectionToken
  useValue: any
}

export interface ClassProvider {
  provide: InjectionToken
  useClass: Function
}

export interface FactoryProvider {
  provide: InjectionToken
  useFactory: (...args: any[]) => any
  inject?: InjectionToken[]
}

export type Provider =
  | Function
  | ValueProvider
  | ClassProvider
  | FactoryProvider

/** Provider / 注入用的 token：类、字符串或 symbol */
export type InjectionToken = Function | string | symbol

export interface ModuleMetadata {
  /** 导入的子模块；扫描时先 walk imports，再注册本模块 */
  imports?: Function[]
  /** IPC / 业务控制器（@Controller）；会注册进 DI，供 IpcBridge resolve */
  controllers?: Function[]
  /** 可注入的 Provider（类 / useValue / useClass / useFactory） */
  providers?: Provider[]
  /** 窗口声明类（@WindowDeclaration）；供 WindowManager 建窗 */
  declarations?: Function[]
  /**
   * 对外暴露的 Provider 白名单，语义与 Nest 一致：
   * - 可写 Provider token，也可写整个模块类（等价于转发该模块的 exports）
   * - 不声明 = 什么都不导出，本模块 Provider 私有
   * - `@Global()` 只免掉 imports，不豁免本列表
   */
  exports?: InjectionToken[]
  /**
   * 是否全局模块（等价 Nest 的 `@Global()`）。
   * 全局模块不需要被 imports；但其 Provider 仍要写进 `exports` 才能被外部注入。
   */
  global?: boolean
}

/**
 * 类装饰器：把模块元数据写入 `Symbol.metadata`，供 ModuleScanner 读取。
 * 只做声明，不执行注册逻辑。
 *
 * 与 `@Global()` 共用同一份 metadata，因此两者先后顺序无关（合并写入）。
 */
export function Module(metadata: ModuleMetadata) {
  return (_target: Function, context: ClassDecoratorContext): void => {
    // Stage 3：写入 context.metadata，类定义完成后可经 Symbol.metadata 读出
    const existing = (context.metadata![META.MODULE] as ModuleMetadata | undefined) ?? {}
    context.metadata![META.MODULE] = { ...existing, ...metadata }
  }
}

/**
 * 标记全局模块，等价 Nest 的 `@Global()`：模块无需被 imports，其中写进 `exports`
 * 的 Provider 即可被任意模块注入（`@Global` 不豁免 `exports`）。
 *
 * ```ts
 * @Global()
 * @Module({ providers: [ConfigService], exports: [ConfigService] })
 * export class ConfigModule {}
 * ```
 */
export function Global() {
  return (_target: Function, context: ClassDecoratorContext): void => {
    const existing = (context.metadata![META.MODULE] as ModuleMetadata | undefined) ?? {}
    context.metadata![META.MODULE] = { ...existing, global: true }
  }
}
