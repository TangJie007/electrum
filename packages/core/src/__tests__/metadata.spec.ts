import { describe, it, expect } from 'vitest'
import {
  Module,
  Injectable,
  Controller,
  IpcHandle,
  Inject,
  META,
  readMetadata,
} from '@electrum/common'

@Injectable()
class TestService {}

@Controller('test')
class TestController {
  @Inject(TestService) svc!: TestService

  @IpcHandle('action')
  doAction() {
    return 'ok'
  }
}

@Module({
  controllers: [TestController],
  providers: [TestService],
})
class TestModule {}

describe('TS5 Decorator Metadata', () => {
  it('stores module metadata', () => {
    const meta = readMetadata<{ controllers: Function[] }>(TestModule, META.MODULE)
    expect(meta?.controllers).toContain(TestController)
  })

  it('stores controller prefix', () => {
    const meta = readMetadata<{ prefix: string }>(TestController, META.CONTROLLER)
    expect(meta?.prefix).toBe('test')
  })

  it('stores IPC handle methods', () => {
    const handlers = readMetadata<{ channel: string }[]>(TestController, META.IPC_HANDLE)
    expect(handlers).toHaveLength(1)
    expect(handlers![0].channel).toBe('action')
  })

  it('stores injection points', () => {
    const injections = readMetadata<{ token: Function }[]>(TestController, META.INJECTIONS)
    expect(injections).toHaveLength(1)
    expect(injections![0].token).toBe(TestService)
  })
})
