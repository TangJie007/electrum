/**
 * 对应：packages/common/src/decorators/inject.decorator.ts
 *
 * Electrum 用「属性注入」，不是构造函数注入：
 * `@Inject(Token)` 写在字段上，只把 { propertyKey, token } 记进 metadata。
 * 真正赋值发生在容器 `resolve`：`new Cls()` 之后。
 */
import { META } from './02-metadata'

export interface InjectionPoint {
  propertyKey: string | symbol
  token: any
  type: 'service'
}

export function Inject(token: any) {
  return (_value: undefined, context: ClassFieldDecoratorContext): void => {
    const injections = (context.metadata![META.INJECTIONS] as InjectionPoint[]) || []
    injections.push({
      propertyKey: context.name,
      token,
      type: 'service',
    })
    context.metadata![META.INJECTIONS] = injections
  }
}
