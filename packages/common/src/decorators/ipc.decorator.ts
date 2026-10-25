import { META } from '../constants/metadata-keys'
import { appendMetadata } from './metadata-list'

export interface IpcHandlerEntry {
  channel: string
  method: string | symbol
  options?: { devOnly?: boolean }
}

export function IpcHandle(channel: string, options?: { devOnly?: boolean }) {
  return (_method: Function, context: ClassMethodDecoratorContext): void => {
    appendMetadata<IpcHandlerEntry>(context.metadata!, META.IPC_HANDLE, {
      channel,
      method: context.name,
      options,
    })
  }
}

export function IpcOn(channel: string) {
  return (_method: Function, context: ClassMethodDecoratorContext): void => {
    appendMetadata<IpcHandlerEntry>(context.metadata!, META.IPC_ON, {
      channel,
      method: context.name,
    })
  }
}
