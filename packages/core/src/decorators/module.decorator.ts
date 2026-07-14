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

export interface ModuleMetadata {
  imports?: Function[]
  controllers?: Function[]
  providers?: Provider[]
  exports?: (Function | string | symbol)[]
  declarations?: Function[]
}

export function Module(metadata: ModuleMetadata) {
  return (_target: Function, context: ClassDecoratorContext): void => {
    context.metadata![META.MODULE] = metadata
  }
}
