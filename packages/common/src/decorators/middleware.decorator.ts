import { META, ownMetadataArray } from '../constants/metadata-keys'

export interface MethodMiddlewareEntry {
  method: string | symbol
  middlewares: Function[]
}

function createMiddlewareDecorator(classKey: symbol, methodKey: symbol) {
  return (...middlewares: Function[]) => {
    return function (
      _target: Function | object,
      context: ClassDecoratorContext | ClassMethodDecoratorContext,
    ): void {
      if (context.kind === 'class') {
        const existing = ownMetadataArray<Function>(context.metadata, classKey)
        context.metadata![classKey] = [...middlewares, ...existing]
      } else {
        // 写时复制：entries 可能来自父类 metadata，原地 push / 改对象会污染父类
        const entries = ownMetadataArray<MethodMiddlewareEntry>(context.metadata, methodKey)
        const index = entries.findIndex((e) => e.method === context.name)
        if (index >= 0) {
          entries[index] = {
            method: context.name,
            middlewares: [...middlewares, ...entries[index].middlewares],
          }
        } else {
          entries.push({ method: context.name, middlewares: [...middlewares] })
        }
        context.metadata![methodKey] = entries
      }
    }
  }
}

export const UseGuards = createMiddlewareDecorator(META.CLASS_GUARDS, META.METHOD_GUARDS)
export const UsePipes = createMiddlewareDecorator(META.CLASS_PIPES, META.METHOD_PIPES)
export const UseInterceptors = createMiddlewareDecorator(
  META.CLASS_INTERCEPTORS,
  META.METHOD_INTERCEPTORS,
)
export const UseFilters = createMiddlewareDecorator(META.CLASS_FILTERS, META.METHOD_FILTERS)
