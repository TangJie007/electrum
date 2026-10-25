import { DIContainer } from '@electrum/core'
import type { Token, ProviderOptions } from '@electrum/core'

/**
 * Lightweight DI wrapper for unit tests.
 * Supports register / override / mock / resolve without starting Electron.
 */
export class TestContainer {
  private container = new DIContainer()

  /** 注册一个 Provider（token 已存在时直接覆盖） */
  register(token: Token, provider: ProviderOptions): this {
    this.container.register(token, provider)
    return this
  }

  /**
   * 显式覆盖一个**已注册**的 Provider。
   *
   * 与 `register()` 的区别：token 未注册时抛错，避免「以为是覆盖、其实是新增」
   * 这种测试里最难查的静默错误。
   */
  overrideProvider(token: Token, provider: ProviderOptions): this {
    if (!this.container.has(token)) {
      const name =
        typeof token === 'function' ? token.name : typeof token === 'string' ? token : String(token)
      throw new Error(
        `Cannot override "${name}": it is not registered. Use register() to add a new provider.`,
      )
    }
    this.container.register(token, provider)
    return this
  }

  /** 用固定值替换某个 Provider（mock 的语法糖） */
  mock(token: Token, value: unknown): this {
    this.container.register(token, { useValue: value })
    return this
  }

  resolve<T>(token: Token): T {
    return this.container.resolve<T>(token)
  }

  /** 异步解析：支持返回 Promise 的 useFactory */
  async resolveAsync<T>(token: Token): Promise<T> {
    return this.container.resolveAsync<T>(token)
  }

  has(token: Token): boolean {
    return this.container.has(token)
  }

  clear(): void {
    this.container.clear()
  }

  /** Escape hatch for advanced tests */
  getContainer(): DIContainer {
    return this.container
  }
}

export function createTestContainer(): TestContainer {
  return new TestContainer()
}
