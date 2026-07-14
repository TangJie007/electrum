import { META } from '../constants/metadata-keys'

export interface InjectionPoint {
  propertyKey: string | symbol
  token: any
  type: 'service' | 'window' | 'optional'
  windowName?: string
  optional?: boolean
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

export function Optional() {
  return (_value: undefined, context: ClassFieldDecoratorContext): void => {
    const injections = (context.metadata![META.INJECTIONS] as InjectionPoint[]) || []
    const last = injections[injections.length - 1]
    if (last && last.propertyKey === context.name) {
      last.type = 'optional'
      last.optional = true
    }
    context.metadata![META.INJECTIONS] = injections
  }
}
