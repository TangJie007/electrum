/**
 * 冒烟：对照「手工接线」vs「容器注入」，理解 DI 在干什么。
 *
 * 跑：pnpm start（在 examples/di 目录）
 */
import './01-polyfill'
import { describe, expect, it } from 'vitest'
import { Injectable } from './03-injectable'
import { Inject } from './04-inject'
import { DIContainer } from './05-container'
import { META, readMetadata } from './02-metadata'

// —— 业务类（与 @electrum/core 用法相同：属性上 @Inject）——

@Injectable()
class Logger {
  lines: string[] = []
  log(msg: string) {
    this.lines.push(msg)
  }
}

@Injectable()
class UserService {
  @Inject(Logger)
  logger!: Logger

  greet(name: string) {
    this.logger.log(`hello ${name}`)
    return `hi, ${name}`
  }
}

describe('手工接线（没有 DI）', () => {
  it('调用方必须自己 new，并手动赋字段', () => {
    const logger = new Logger()
    const users = new UserService()
    users.logger = logger // ← 手工注入

    expect(users.greet('Ada')).toBe('hi, Ada')
    expect(logger.lines).toEqual(['hello Ada'])
  })
})

describe('装饰器只写 metadata，不创建实例', () => {
  it('@Injectable / @Inject 把声明记在 Symbol.metadata', () => {
    const injectable = readMetadata<{ isInjectable: boolean; scope: string }>(
      Logger,
      META.INJECTABLE,
    )
    expect(injectable).toEqual({ isInjectable: true, scope: 'singleton' })

    const injections = readMetadata<{ propertyKey: string; token: Function }[]>(
      UserService,
      META.INJECTIONS,
    )
    expect(injections).toEqual([{ propertyKey: 'logger', token: Logger, type: 'service' }])
  })
})

describe('容器注入（与 @electrum/core 同路径）', () => {
  it('register → resolve：new + 读 metadata + 递归赋字段', () => {
    const container = new DIContainer()
    container.register(Logger, { useClass: Logger })
    container.register(UserService, { useClass: UserService })

    const users = container.resolve(UserService)

    expect(users.logger).toBeInstanceOf(Logger)
    expect(users.greet('Grace')).toBe('hi, Grace')
    expect(users.logger.lines).toEqual(['hello Grace'])
  })

  it('singleton：同 token 只创建一次', () => {
    const container = new DIContainer()
    container.register(Logger, { useClass: Logger })
    container.register(UserService, { useClass: UserService })

    const a = container.resolve(UserService)
    const b = container.resolve(UserService)
    const log = container.resolve(Logger)

    expect(a).toBe(b)
    expect(a.logger).toBe(log)
  })

  it('useValue / useFactory 也走同一套 resolve', () => {
    const container = new DIContainer()
    container.register('APP_NAME', { useValue: 'electrum-di-demo' })
    container.register('BANNER', {
      useFactory: (name: string) => `[${name}]`,
      inject: ['APP_NAME'],
    })

    expect(container.resolve('BANNER')).toBe('[electrum-di-demo]')
  })

  it('环依赖会抛错', () => {
    // 用 string token，避免 class A 装饰器求值时 class B 尚未声明
    @Injectable()
    class A {
      @Inject('B')
      b!: unknown
    }
    @Injectable()
    class B {
      @Inject('A')
      a!: unknown
    }

    const container = new DIContainer()
    container.register('A', { useClass: A })
    container.register('B', { useClass: B })

    expect(() => container.resolve('A')).toThrow(/Circular dependency/)
  })
})
