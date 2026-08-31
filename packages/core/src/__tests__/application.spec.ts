import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ipcMain } from 'electron'
import {
  Module,
  Controller,
  IpcHandle,
  Injectable,
  AppEvent,
} from '@electrum/common'
import { DIContainer } from '../di/container'
import { IpcBridge } from '../bridge/ipc-bridge'
import { MiddlewarePipeline } from '../middleware/pipeline'
import { createApp } from '../application'

vi.mock('electron', () => ({
  app: {
    on: vi.fn(),
    removeListener: vi.fn(),
    whenReady: vi.fn(),
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
    removeAllListeners: vi.fn(),
  },
}))

@Injectable()
class AppListener {
  @AppEvent('activate')
  onActivate() {}
}

@Controller('demo')
class DemoController {
  @IpcHandle('ping')
  ping() {
    return 'pong'
  }
}

@Module({
  controllers: [DemoController],
  providers: [AppListener],
})
class TestModule {}

type ApplicationInternals = {
  shutdown: () => Promise<void>
  ipcBridge?: { unregisterAll: () => void }
  eventBridge?: { unregisterAll: () => void }
  lifecycle?: { runHook: (name: string) => Promise<void> }
}

describe('IpcBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('unregisterAll removes handle and on listeners for registered channels', () => {
    const container = new DIContainer()
    container.register(DemoController, { useClass: DemoController })
    const pipeline = new MiddlewarePipeline(container)
    const bridge = new IpcBridge(container, [{ controllers: [DemoController] }], pipeline)

    bridge.registerAll()
    bridge.unregisterAll()

    expect(ipcMain.handle).toHaveBeenCalledWith('demo:ping', expect.any(Function))
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('demo:ping')
    expect(ipcMain.removeAllListeners).toHaveBeenCalledWith('demo:ping')
  })
})

describe('Application.shutdown', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('unregisters IPC and app event bridges exactly once', async () => {
    const app = createApp(TestModule)
    const internals = app as unknown as ApplicationInternals

    internals.ipcBridge = { unregisterAll: vi.fn() }
    internals.eventBridge = { unregisterAll: vi.fn() }
    internals.lifecycle = { runHook: vi.fn().mockResolvedValue(undefined) }

    await internals.shutdown()
    await internals.shutdown()

    expect(internals.ipcBridge?.unregisterAll).toHaveBeenCalledOnce()
    expect(internals.eventBridge?.unregisterAll).toHaveBeenCalledOnce()
    expect(internals.lifecycle?.runHook).toHaveBeenCalledOnce()
  })
})
