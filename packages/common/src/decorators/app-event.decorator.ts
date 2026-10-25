import { META } from '../constants/metadata-keys'
import { appendMetadata } from './metadata-list'

export interface AppEventEntry {
  event: string
  method: string | symbol
}

export function AppEvent(eventName: string) {
  return (_method: Function, context: ClassMethodDecoratorContext): void => {
    appendMetadata<AppEventEntry>(context.metadata!, META.APP_EVENT, {
      event: eventName,
      method: context.name,
    })
  }
}
