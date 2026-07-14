export interface IpcApi {
  'app:info': () => Promise<{
    name: string
    version: string
    electron: string
    chrome: string
    node: string
    platform: string
    demoFile: string
  }>
  'app:ping': (message: string) => Promise<{ echo: string; at: number }>
  'file:read': (path: string) => Promise<string>
  'file:write': (data: { path: string; content: string }) => Promise<{ ok: true; path: string }>
}

export interface ElectronAPI {
  invoke: <K extends keyof IpcApi>(
    channel: K,
    ...args: Parameters<IpcApi[K]>
  ) => ReturnType<IpcApi[K]>
  on: (channel: string, listener: (...args: any[]) => void) => () => void
  send: (channel: string, ...args: any[]) => void
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}

export {}
