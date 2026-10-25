import { describe, it, expect, vi, beforeEach } from 'vitest'
import { app } from 'electron'
import { Injectable, AppEvent } from '@electrum/common'
import { DIContainer } from '../di/container'
import { EventBridge } from '../bridge/event-bridge'
import type { ScannedModule } from '../module/scanner'

/** 构造最小可用的扫描结果 */
function stubModule(overrides: Partial<ScannedModule>): ScannedModule {
  return {
    moduleClass: class {},
    metadata: {},
    controllers: [],
    providers: [],
    declarations: [],
    ...overrides,
  }
}

vi.mock('electron', () => ({
  app: {
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}))

@Injectable()
class AppListener {
  @AppEvent('activate')
  onActivate() {}
}

describe('EventBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('unregisterAll removes all registered app listeners', async () => {
    const container = new DIContainer()
    container.register(AppListener, { useClass: AppListener })

    const bridge = new EventBridge(container, [stubModule({ providers: [AppListener] })])
    await bridge.registerAll()
    bridge.unregisterAll()

    expect(app.on).toHaveBeenCalledOnce()
    expect(app.removeListener).toHaveBeenCalledOnce()

    const listener = vi.mocked(app.on).mock.calls[0][1]
    expect(app.removeListener).toHaveBeenCalledWith('activate', listener)
  })
})
