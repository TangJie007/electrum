import type { IpcContext } from '../guards/guard.interface'

/**
 * Pipe 执行上下文。
 *
 * IPC 没有参数类型元数据（不像 Nest 能靠 `emitDecoratorMetadata` 逐参数绑定 Pipe），
 * 因此管线会**对每个参数**依次调用 Pipe，并用 `index` 标明当前处理的是第几个参数：
 * 只关心第一个参数的 Pipe 直接 `if (context.index !== 0) return value` 即可。
 */
export interface PipeContext extends IpcContext {
  /** 当前参数在参数列表中的下标 */
  index: number
  /** 参数总数 */
  argCount: number
}

export interface PipeTransform {
  transform(value: any, context: PipeContext): any | Promise<any>
}
