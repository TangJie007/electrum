import { META } from '../constants/metadata-keys'

export interface ValueProvider {
  provide: string | symbol
  useValue: any
}

export interface ClassProvider {
  provide: any
  useClass: Function
}

export interface FactoryProvider {
  provide: any
  useFactory: (...args: any[]) => any
  inject?: any[]
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
   * 对外暴露的 Provider token 白名单。
   *
   * 声明后，本模块的 Provider 只有出现在该列表里，才会被「导入本模块」的其它模块看见；
   * 未声明（undefined）时保持旧行为——本模块 Provider 全部对外可见。
   */
  exports?: InjectionToken[]
}

/**
 * 类装饰器：把模块元数据写入 `Symbol.metadata`，供 ModuleScanner 读取。
 * 不执行注册逻辑，只声明 imports / controllers / providers / declarations。
 */
export function Module(metadata: ModuleMetadata) {
  return (_target: Function, context: ClassDecoratorContext): void => {
    // Stage 3：写入 context.metadata，类定义完成后可经 Symbol.metadata 读出
    context.metadata![META.MODULE] = metadata
  }
}
