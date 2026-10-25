import { META } from '../constants/metadata-keys'

/**
 * 声明一个 ExceptionFilter 负责哪些异常类型（等价 Nest 的 `@Catch()`）。
 *
 * - `@Catch(HttpException)`：只接住该类型（含子类）
 * - `@Catch(A, B)`：任一命中即可
 * - 不写 `@Catch`：catch-all，接住所有异常
 *
 * 匹配到多个 Filter 时按「方法级 → 类级 → 全局」的顺序取第一个命中的。
 *
 * @example
 * @Catch(NotFoundException)
 * export class NotFoundFilter implements ExceptionFilter { ... }
 */
export function Catch(...exceptions: Function[]) {
  return (_target: Function, context: ClassDecoratorContext): void => {
    context.metadata![META.CATCH] = [...exceptions]
  }
}
