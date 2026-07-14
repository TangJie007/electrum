import { META } from '../constants/metadata-keys'

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
