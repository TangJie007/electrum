import { META } from '../constants/metadata-keys'

export interface AppEventEntry {
  event: string
  method: string | symbol
}

export function AppEvent(eventName: string) {
  return (method: Function, context: ClassMethodDecoratorContext): Function => {
    const handlers = (context.metadata![META.APP_EVENT] as AppEventEntry[]) || []
    handlers.push({ event: eventName, method: context.name })
    context.metadata![META.APP_EVENT] = handlers
    return method
  }
}
