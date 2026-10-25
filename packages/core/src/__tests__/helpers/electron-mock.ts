import { vi } from 'vitest'

/** `new BrowserWindow()` 产出的假窗口 */
export interface MockBrowserWindow {
  /** 建窗时传入的 options，供断言 */
  options: unknown
  webContents: {
    send: ReturnType<typeof vi.fn>
    openDevTools: ReturnType<typeof vi.fn>
    /** `WindowManager.sendTo` 用它判断要不要把消息排到 did-finish-load */
    isLoadingMainFrame: () => boolean
  }
  loadURL: ReturnType<typeof vi.fn>
  loadFile: ReturnType<typeof vi.fn>
  once: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  show: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
  isDestroyed: ReturnType<typeof vi.fn>
}

export interface BrowserWindowMockOptions {
  /** `isLoadingMainFrame()` 的返回值，默认 false（加载已完成） */
  loading?: boolean
}

/**
 * 生成 `BrowserWindow` 构造函数 mock。
 *
 * 四个测试文件原本各写一份 `vi.fn().mockImplementation(...)`，字段还不一致
 * （有的漏了 `isLoadingMainFrame`）。统一后缺字段不会再演变成
 * 「某个用例里 WindowManager 走了另一条分支」这类隐性差异。
 *
 * 用法（`vi.mock` 的工厂会被提升到 import 之前，因此只能动态 import）：
 * ```ts
 * const h = vi.hoisted(() => ({ windows: [] as MockBrowserWindow[] }))
 * vi.mock('electron', async () => {
 *   const { createBrowserWindowMock } = await import('./helpers/electron-mock')
 *   return { BrowserWindow: createBrowserWindowMock(h.windows) }
 * })
 * ```
 */
export function createBrowserWindowMock(
  created: MockBrowserWindow[] = [],
  options: BrowserWindowMockOptions = {},
): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation((windowOptions: unknown) => {
    const win: MockBrowserWindow = {
      options: windowOptions,
      webContents: {
        send: vi.fn(),
        openDevTools: vi.fn(),
        isLoadingMainFrame: () => options.loading ?? false,
      },
      loadURL: vi.fn().mockResolvedValue(undefined),
      loadFile: vi.fn().mockResolvedValue(undefined),
      once: vi.fn(),
      on: vi.fn(),
      show: vi.fn(),
      destroy: vi.fn(),
      isDestroyed: vi.fn(() => false),
    }
    created.push(win)
    return win
  })
}
