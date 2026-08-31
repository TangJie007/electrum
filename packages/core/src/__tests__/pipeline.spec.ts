import { describe, it, expect } from 'vitest'
import {
  Controller,
  IpcHandle,
  UseFilters,
  ForbiddenException,
  NotFoundException,
  type ExceptionFilter,
  type IpcContext,
  type IpcErrorResponse,
} from '@electrum/common'
import { DIContainer } from '../di/container'
import { MiddlewarePipeline } from '../middleware/pipeline'

class MethodOnlyFilter implements ExceptionFilter {
  catch(_exception: unknown, _context: IpcContext): IpcErrorResponse {
    return { __error: true, code: 'METHOD_FILTER', message: 'handled by method filter' }
  }
}

@Controller('demo')
class DemoController {
  @IpcHandle('read')
  @UseFilters(MethodOnlyFilter)
  read() {
    throw new NotFoundException('file')
  }

  @IpcHandle('missing')
  missing() {
    throw new NotFoundException('file')
  }

  @IpcHandle('write')
  write() {
    throw new ForbiddenException('denied')
  }
}

describe('MiddlewarePipeline.runFilters', () => {
  it('serializes ElectronException with correct code when no filter is registered', async () => {
    const container = new DIContainer()
    const pipeline = new MiddlewarePipeline(container)
    const instance = new DemoController()

    const result = await pipeline.execute({
      type: 'handle',
      instance,
      method: 'write',
      controllerClass: DemoController,
      channel: 'demo:write',
      event: {} as any,
      args: [],
    })

    expect(result).toEqual({
      __error: true,
      code: 'FORBIDDEN',
      message: 'denied',
    })
  })

  it('serializes NotFoundException with correct code when no filter is registered', async () => {
    const container = new DIContainer()
    const pipeline = new MiddlewarePipeline(container)
    const instance = new DemoController()

    const result = await pipeline.execute({
      type: 'handle',
      instance,
      method: 'missing',
      controllerClass: DemoController,
      channel: 'demo:missing',
      event: {} as any,
      args: [],
    })

    expect(result).toEqual({
      __error: true,
      code: 'NOT_FOUND',
      message: 'file not found',
    })
  })

  it('applies method-level @UseFilters by handler method name, not IPC channel', async () => {
    const container = new DIContainer()
    container.register(MethodOnlyFilter, { useClass: MethodOnlyFilter })
    const pipeline = new MiddlewarePipeline(container)
    const instance = new DemoController()

    const result = await pipeline.execute({
      type: 'handle',
      instance,
      method: 'read',
      controllerClass: DemoController,
      channel: 'demo:read',
      event: {} as any,
      args: [],
    })

    expect(result).toEqual({
      __error: true,
      code: 'METHOD_FILTER',
      message: 'handled by method filter',
    })
  })
})
