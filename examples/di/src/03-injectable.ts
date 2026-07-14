/**
 * 对应：packages/common/src/decorators/injectable.decorator.ts
 *
 * `@Injectable()` 本身不创建实例，只是在类的 metadata 上贴标签：
 * 「这个类可以被容器管理，默认 singleton」。
 */
import { META } from './02-metadata'

export type Scope = 'singleton' | 'transient'

export interface InjectableOptions {
  scope?: Scope
}

export function Injectable(options: InjectableOptions = {}) {
  return (_target: Function, context: ClassDecoratorContext): void => {
    context.metadata![META.INJECTABLE] = {
      isInjectable: true,
      scope: options.scope || 'singleton',
    }
  }
}
