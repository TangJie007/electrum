import { describe, it, expect, vi } from 'vitest'
import { Injectable } from '@electrum/common'
import { DIContainer } from '../di/container'
import { LifecycleManager } from '../lifecycle/manager'
import { stubModule } from './helpers/scanned-module'

@Injectable()
class Alpha {
  hooks: string[] = []
  async onModuleInit() {
    this.hooks.push('alpha:init')
  }
  async onAppReady() {
    this.hooks.push('alpha:ready')
  }
  async onModuleDestroy() {
    this.hooks.push('alpha:destroy')
  }
}

@Injectable()
class Beta {
  hooks: string[] = []
  async onModuleInit() {
    this.hooks.push('beta:init')
  }
  async onAppReady() {
    throw new Error('beta ready failed')
  }
}

describe('LifecycleManager', () => {
  it('runs hooks serially and reports failures without aborting the chain', async () => {
    const container = new DIContainer()
    container.register(Alpha, { useClass: Alpha })
    container.register(Beta, { useClass: Beta })
    const alpha = container.resolve<Alpha>(Alpha)
    const beta = container.resolve<Beta>(Beta)

    const lifecycle = new LifecycleManager(container, [stubModule({ providers: [Alpha, Beta] })])

    await lifecycle.runHook('onModuleInit')
    expect(alpha.hooks).toContain('alpha:init')
    expect(beta.hooks).toContain('beta:init')

    const errorSpy = vi.spyOn((lifecycle as any).logger, 'error').mockImplementation(() => {})
    await lifecycle.runHook('onAppReady')
    expect(alpha.hooks).toContain('alpha:ready')
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()

    await lifecycle.runHook('onModuleDestroy')
    expect(alpha.hooks).toContain('alpha:destroy')
  })
})
