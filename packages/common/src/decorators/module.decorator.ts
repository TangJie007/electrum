import { META } from '../constants/metadata-keys'
import type { Scope } from './injectable.decorator'

export interface ValueProvider {
  provide: InjectionToken
  useValue: any
  /** 只有 `useValue` 常量时一般不需要；显式声明可让配置对象按请求/瞬时重建 */
  scope?: Scope
}

export interface ClassProvider {
  provide: InjectionToken
  useClass: Function
  /** 未声明时继承 `useClass` 上的 `@Injectable({ scope })` */
  scope?: Scope
}

export interface FactoryProvider {
  provide: InjectionToken
  useFactory: (...args: any[]) => any
  inject?: InjectionToken[]
  /** 工厂的实例作用域（singleton / transient / request），默认 singleton */
  scope?: Scope
}

export type Provider =
  | Function
  | ValueProvider
  | ClassProvider
  | FactoryProvider

/** 仅存在于类型层的 token 标记，用户无法伪造 */
declare const INJECTION_TOKEN_TYPE: unique symbol

/**
 * `createInjectionToken<T>()` 的返回类型：运行时是 symbol，类型上携带 `T`。
 */
export interface TypedInjectionToken<T> {
  readonly [INJECTION_TOKEN_TYPE]: T
  readonly description: string
}

/**
 * Provider / 注入用的 token：类、字符串、symbol 或 `createInjectionToken()` 的结果。
 *
 * 泛型参数只影响**类型推断**（`container.resolve(TOKEN)` 拿到的就是 `T`），
 * 运行时仍然是 symbol，`Map` 键语义与手写 `Symbol.for()` 完全一致。
 *
 * ```ts
 * const USER_REPO = createInjectionToken<UserRepository>('UserRepository')
 * const repo = app.resolve(USER_REPO)   // repo: UserRepository
 * ```
 */
export type InjectionToken<T = unknown> =
  | Function
  | string
  | symbol
  | TypedInjectionToken<T>

/**
 * 创建带类型的注入 token。
 *
 * 用 `Symbol.for()` 保证同名 token 在热重载 / 多份模块副本间仍是同一个键；
 * 描述同时用于错误信息与依赖图输出。
 */
export function createInjectionToken<T = unknown>(description: string): InjectionToken<T> {
  return Symbol.for(`electrum:token:${description}`) as unknown as TypedInjectionToken<T>
}

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
 * 合并写入 `META.MODULE`。
 *
 * `@Module` 与 `@Global()` 共用同一份 metadata，因此两者先后顺序无关 ——
 * 都走这里做「读旧值 → 浅合并 → 写回」。
 */
function mergeModuleMetadata(
  context: ClassDecoratorContext,
  patch: Partial<ModuleMetadata>,
): void {
  const existing = (context.metadata![META.MODULE] as ModuleMetadata | undefined) ?? {}
  context.metadata![META.MODULE] = { ...existing, ...patch }
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
    mergeModuleMetadata(context, metadata)
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
    mergeModuleMetadata(context, { global: true })
  }
}
