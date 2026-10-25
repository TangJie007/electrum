import { META, ownMetadataArray } from '../constants/metadata-keys'
import type { InjectionPoint } from './inject.decorator'

export function WindowRef(name = 'main') {
  return (_value: undefined, context: ClassFieldDecoratorContext): void => {
    const injections = ownMetadataArray<InjectionPoint>(context.metadata, META.INJECTIONS)
    injections.push({
      propertyKey: context.name,
      token: Symbol.for(`electrum:window:${name}`),
      type: 'window',
      windowName: name,
    })
    context.metadata![META.INJECTIONS] = injections
  }
}
