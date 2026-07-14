import { contextBridge, ipcRenderer } from 'electron'

class IpcError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message)
    this.name = 'IpcError'
  }
}

contextBridge.exposeInMainWorld('api', {
  invoke: async (channel: string, ...args: unknown[]) => {
    const result = await ipcRenderer.invoke(channel, ...args)
    if (result && typeof result === 'object' && (result as { __error?: boolean }).__error) {
      const err = result as { code: string; message: string; details?: unknown }
      throw new IpcError(err.code, err.message, err.details)
    }
    return result
  },
  on: (channel: string, listener: (...args: unknown[]) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => listener(...args)
    ipcRenderer.on(channel, handler)
    return () => {
      ipcRenderer.removeListener(channel, handler)
    }
  },
  send: (channel: string, ...args: unknown[]) => {
    ipcRenderer.send(channel, ...args)
  },
})
