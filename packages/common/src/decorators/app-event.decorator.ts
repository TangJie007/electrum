import { META, ownMetadataArray } from '../constants/metadata-keys'

export interface AppEventEntry {
  event: string
  method: string | symbol
}

export function AppEvent(eventName: string) {
  return (_method: Function, context: ClassMethodDecoratorContext): void => {
    const handlers = ownMetadataArray<AppEventEntry>(context.metadata, META.APP_EVENT)
    handlers.push({ event: eventName, method: context.name })
    context.metadata![META.APP_EVENT] = handlers
  }
}
