import { META } from '../constants/metadata-keys'
import { appendMetadata } from './metadata-list'
import type { InjectionPoint } from './inject.decorator'

export function WindowRef(name = 'main') {
  return (_value: undefined, context: ClassFieldDecoratorContext): void => {
    appendMetadata<InjectionPoint>(context.metadata!, META.INJECTIONS, {
      propertyKey: context.name,
      token: Symbol.for(`electrum:window:${name}`),
      type: 'window',
      windowName: name,
    })
  }
}
