import { META, ownMetadataArray } from '../constants/metadata-keys'

export interface IpcHandlerEntry {
  channel: string
  method: string | symbol
  options?: { devOnly?: boolean }
}

export function IpcHandle(channel: string, options?: { devOnly?: boolean }) {
  return (_method: Function, context: ClassMethodDecoratorContext): void => {
    const handlers = ownMetadataArray<IpcHandlerEntry>(context.metadata, META.IPC_HANDLE)
    handlers.push({ channel, method: context.name, options })
    context.metadata![META.IPC_HANDLE] = handlers
  }
}

export function IpcOn(channel: string) {
  return (_method: Function, context: ClassMethodDecoratorContext): void => {
    const handlers = ownMetadataArray<IpcHandlerEntry>(context.metadata, META.IPC_ON)
    handlers.push({ channel, method: context.name })
    context.metadata![META.IPC_ON] = handlers
  }
}
