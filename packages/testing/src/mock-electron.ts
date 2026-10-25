export type MockIpcHandler = (event: unknown, ...args: unknown[]) => unknown | Promise<unknown>
export type MockIpcListener = (event: unknown, ...args: unknown[]) => void
export type MockAppListener = (...args: unknown[]) => void

export interface MockBrowserWindowOptions {
  webPreferences?: Record<string, unknown>
  width?: number
  height?: number
  show?: boolean
  [key: string]: unknown
}

export class MockBrowserWindow {
  static instances: MockBrowserWindow[] = []

  webContents = {
    send: (channel: string, ...args: unknown[]) => {
      this.sent.push({ channel, args })
    },
    // WindowManager.sendTo 在窗口仍在加载时会用 once('did-finish-load') 排队消息
    once: (_event: string, _listener: (...args: unknown[]) => void): void => {
      this.pendingLoadListeners.push(_listener)
    },
    id: MockBrowserWindow.instances.length + 1,
  }

  /** `webContents.once` 排队的回调；测试里可手动触发以模拟加载完成 */
  pendingLoadListeners: Array<(...args: unknown[]) => void> = []

  sent: Array<{ channel: string; args: unknown[] }> = []
  destroyed = false

  constructor(public options: MockBrowserWindowOptions = {}) {
    MockBrowserWindow.instances.push(this)
  }

  loadURL(_url: string): Promise<void> {
    return Promise.resolve()
  }

  loadFile(_filePath: string): Promise<void> {
    return Promise.resolve()
  }

  show(): void {}
  hide(): void {}
  focus(): void {}
  close(): void {
    this.destroyed = true
  }
  destroy(): void {
    this.destroyed = true
  }
  isDestroyed(): boolean {
    return this.destroyed
  }
  on(_event: string, _listener: (...args: unknown[]) => void): this {
    return this
  }
  once(_event: string, _listener: (...args: unknown[]) => void): this {
    return this
  }
}

export interface MockElectron {
  app: {
    whenReady: () => Promise<void>
    on: (event: string, listener: MockAppListener) => void
    once: (event: string, listener: MockAppListener) => void
    removeListener: (event: string, listener: MockAppListener) => void
    quit: () => void
    getAppPath: () => string
    isReady: () => boolean
  }
  ipcMain: {
    handle: (channel: string, listener: MockIpcHandler) => void
    on: (channel: string, listener: MockIpcListener) => void
    removeHandler: (channel: string) => void
    /**
     * 精确移除某一个 listener。
     *
     * `IpcBridge.unregisterAll()` 走的是这条路（不用 `removeAllListeners`，
     * 否则会误伤业务自己在同一 channel 上挂的监听），所以 mock 必须提供它 ——
     * 早期版本只 mock 了 `removeAllListeners`，导致 `app.shutdown()` 在测试里直接抛
     * `ipcMain.removeListener is not a function`。
     */
    removeListener: (channel: string, listener: MockIpcListener) => void
    removeAllListeners: (channel?: string) => void
    /** Test helper: invoke a registered handle channel */
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    /** Test helper: emit to registered on listeners */
    emit: (channel: string, ...args: unknown[]) => void
    /** Test helper: list handle channels */
    handleChannels: () => string[]
    /** Test helper: list on channels */
    onChannels: () => string[]
  }
  BrowserWindow: typeof MockBrowserWindow
  /** Clear all registered handlers / listeners / windows */
  reset: () => void
}

/**
 * Build an in-memory Electron mock for unit / integration tests.
 *
 * Typical Vitest usage:
 *
 * ```ts
 * import { mockElectron } from '@electrum/testing'
 *
 * const electron = mockElectron()
 * vi.mock('electron', () => electron)
 * ```
 */
export function mockElectron(): MockElectron {
  const handleHandlers = new Map<string, MockIpcHandler>()
  const onListeners = new Map<string, Set<MockIpcListener>>()
  const appListeners = new Map<string, Set<MockAppListener>>()
  let ready = false

  const ipcMain = {
    handle(channel: string, listener: MockIpcHandler): void {
      handleHandlers.set(channel, listener)
    },
    on(channel: string, listener: MockIpcListener): void {
      let set = onListeners.get(channel)
      if (!set) {
        set = new Set()
        onListeners.set(channel, set)
      }
      set.add(listener)
    },
    removeHandler(channel: string): void {
      handleHandlers.delete(channel)
    },
    removeListener(channel: string, listener: MockIpcListener): void {
      const set = onListeners.get(channel)
      if (!set) return
      set.delete(listener)
      // 与 Electron 一致：空了就把 key 收掉，避免 onChannels() 报告幽灵频道
      if (set.size === 0) onListeners.delete(channel)
    },
    removeAllListeners(channel?: string): void {
      if (channel) onListeners.delete(channel)
      else onListeners.clear()
    },
    async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
      const handler = handleHandlers.get(channel)
      if (!handler) {
        throw new Error(`No ipcMain.handle registered for channel "${channel}"`)
      }
      return handler({ sender: { id: 1 } }, ...args)
    },
    emit(channel: string, ...args: unknown[]): void {
      const listeners = onListeners.get(channel)
      if (!listeners) return
      for (const listener of listeners) {
        listener({ sender: { id: 1 } }, ...args)
      }
    },
    handleChannels(): string[] {
      return [...handleHandlers.keys()]
    },
    onChannels(): string[] {
      return [...onListeners.keys()]
    },
  }

  const app = {
    whenReady(): Promise<void> {
      ready = true
      return Promise.resolve()
    },
    on(event: string, listener: MockAppListener): void {
      let set = appListeners.get(event)
      if (!set) {
        set = new Set()
        appListeners.set(event, set)
      }
      set.add(listener)
    },
    once(event: string, listener: MockAppListener): void {
      const wrap: MockAppListener = (...args) => {
        app.removeListener(event, wrap)
        listener(...args)
      }
      app.on(event, wrap)
    },
    removeListener(event: string, listener: MockAppListener): void {
      appListeners.get(event)?.delete(listener)
    },
    quit(): void {
      const listeners = appListeners.get('before-quit')
      if (listeners) {
        for (const listener of [...listeners]) listener()
      }
    },
    getAppPath(): string {
      return process.cwd()
    },
    isReady(): boolean {
      return ready
    },
  }

  const reset = (): void => {
    handleHandlers.clear()
    onListeners.clear()
    appListeners.clear()
    MockBrowserWindow.instances = []
    ready = false
  }

  return {
    app,
    ipcMain,
    BrowserWindow: MockBrowserWindow,
    reset,
  }
}
