import { BrowserWindow } from 'electron'
import { META, readMetadata, Logger, type WindowOptions } from '@electrum/common'
import type { DIContainer } from '../di/container'
import type { ScannedModule } from '../module/scanner'

export class WindowManager {
  private logger = new Logger('WindowManager')
  private windows = new Map<string, BrowserWindow>()

  constructor(private container: DIContainer) {}

  async initialize(scannedModules: ScannedModule[]): Promise<void> {
    this.container.setWindowProvider((name) => this.getWindow(name))

    for (const mod of scannedModules) {
      for (const declClass of mod.declarations || []) {
        const config = readMetadata<WindowOptions>(declClass, META.WINDOW_DECLARATION)
        if (!config) continue
        if (config.autoCreate !== false) {
          this.createWindow(config)
        }
      }
    }
  }

  /**
   * 创建窗口；同名窗口仍存活时**复用**而不是覆盖。
   *
   * 直接覆盖 Map 会让旧 BrowserWindow 失去引用但仍存活（进程里真实的窗口泄漏，
   * 且 `window-all-closed` 不再触发）。
   */
  createWindow(config: WindowOptions): BrowserWindow {
    const existing = this.windows.get(config.name)
    if (existing && !existing.isDestroyed()) {
      this.logger.warn(`Window "${config.name}" already exists, reusing the live one`)
      return existing
    }

    const win = new BrowserWindow(config.options || {})

    const isDev = !!process.env.ELECTRON_RENDERER_URL || process.env.NODE_ENV?.includes('dev')

    if (isDev && (process.env.ELECTRON_RENDERER_URL || config.devUrl)) {
      const url = process.env.ELECTRON_RENDERER_URL || config.devUrl!
      void win.loadURL(url).catch((err: any) => {
        this.logger.error(`Window "${config.name}" failed to load ${url}: ${err?.message || err}`)
      })
      if (process.env.ELECTRON_OPEN_DEVTOOLS === '1') {
        win.webContents.openDevTools({ mode: 'detach' })
      }
    } else if (config.prodFile) {
      void win.loadFile(config.prodFile).catch((err: any) => {
        this.logger.error(
          `Window "${config.name}" failed to load ${config.prodFile}: ${err?.message || err}`,
        )
      })
    }

    this.windows.set(config.name, win)
    win.once('ready-to-show', () => {
      // `show: false` 是显式意图（由业务自己择机显示），不能被这里的默认行为推翻
      if (!win.isDestroyed() && config.options?.show !== false) win.show()
    })
    win.on('closed', () => {
      this.windows.delete(config.name)
    })

    this.logger.log(`Window "${config.name}" created`)
    return win
  }

  getWindow(name = 'main'): BrowserWindow | undefined {
    return this.windows.get(name)
  }

  getAllWindows(): BrowserWindow[] {
    return [...this.windows.values()]
  }

  /** 向单个窗口发消息；窗口还在加载时排队到 `did-finish-load`，避免消息丢失 */
  sendTo(name: string, channel: string, ...args: any[]): void {
    const win = this.windows.get(name)
    if (!win || win.isDestroyed()) return

    const send = () => {
      if (!win.isDestroyed()) win.webContents.send(channel, ...args)
    }

    if (this.isLoading(win)) {
      win.webContents.once('did-finish-load', send)
      return
    }
    send()
  }

  broadcast(channel: string, ...args: any[]): void {
    for (const win of this.windows.values()) {
      if (win.isDestroyed()) continue

      const send = () => {
        if (!win.isDestroyed()) win.webContents.send(channel, ...args)
      }

      if (this.isLoading(win)) {
        win.webContents.once('did-finish-load', send)
      } else {
        send()
      }
    }
  }

  /** 关闭并清空全部窗口（start 失败回滚 / shutdown 使用） */
  destroyAll(): void {
    for (const win of this.windows.values()) {
      if (!win.isDestroyed()) win.destroy()
    }
    this.windows.clear()
  }

  private isLoading(win: BrowserWindow): boolean {
    const webContents = win.webContents as { isLoadingMainFrame?: () => boolean }
    return typeof webContents.isLoadingMainFrame === 'function'
      ? webContents.isLoadingMainFrame()
      : false
  }
}
