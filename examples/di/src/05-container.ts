/**
 * 对应：packages/core/src/di/container.ts（砍掉 window / @Optional，保留主路径）
 *
 * 两阶段：
 *   register(token, recipe)  — 只记账，不 new
 *   resolve(token)           — new + 读 @Inject + 递归 resolve + 赋字段
 */
import { META, readMetadata } from './02-metadata'
import type { InjectionPoint } from './04-inject'
import type { Scope } from './03-injectable'

export type Token = Function | string | symbol

interface ProviderRecord {
  token: Token
  useClass?: Function
  useValue?: any
  useFactory?: (...args: any[]) => any
  inject?: Token[]
  scope: Scope
}

export class DIContainer {
  private singletons = new Map<Token, any>()
  private providers = new Map<Token, ProviderRecord>()
  /** 正在解析中的 token，用来检测 A→B→A 环依赖 */
  private resolving = new Set<Token>()

  register(
    token: Token,
    options: {
      useClass?: Function
      useValue?: any
      useFactory?: (...args: any[]) => any
      inject?: Token[]
      scope?: Scope
    } = {},
  ): void {
    this.providers.set(token, {
      token,
      useClass: options.useClass,
      useValue: options.useValue,
      useFactory: options.useFactory,
      inject: options.inject,
      scope: options.scope || 'singleton',
    })
  }

  resolve<T = any>(token: Token): T {
    // 1. singleton 缓存命中
    if (this.singletons.has(token)) {
      return this.singletons.get(token)
    }

    // 2. 环依赖
    if (this.resolving.has(token)) {
      throw new Error(
        `Circular dependency: ${this.formatToken(token)} already in ` +
          `[${[...this.resolving].map((t) => this.formatToken(t)).join(' → ')}]`,
      )
    }

    const record = this.providers.get(token)

    // 3. useValue：直接返回固定值
    if (record && 'useValue' in record && record.useValue !== undefined) {
      if (record.scope === 'singleton') this.singletons.set(token, record.useValue)
      return record.useValue
    }

    // 4. useFactory：先 resolve inject 列表，再调工厂
    if (record?.useFactory) {
      const args = (record.inject || []).map((t) => this.resolve(t))
      const instance = record.useFactory(...args)
      if (record.scope === 'singleton') this.singletons.set(token, instance)
      return instance
    }

    // 5. useClass / 类 token：无参 new + 属性注入
    const targetClass = record?.useClass || (typeof token === 'function' ? token : null)
    if (!targetClass) {
      throw new Error(`No provider for: ${this.formatToken(token)}`)
    }

    this.resolving.add(token)
    try {
      const instance = new (targetClass as any)()
      const injections = readMetadata<InjectionPoint[]>(targetClass, META.INJECTIONS) || []

      for (const injection of injections) {
        instance[injection.propertyKey] = this.resolve(injection.token)
      }

      if ((record?.scope || 'singleton') === 'singleton') {
        this.singletons.set(token, instance)
      }

      return instance
    } finally {
      this.resolving.delete(token)
    }
  }

  private formatToken(token: Token): string {
    if (typeof token === 'function') return token.name || '<anonymous>'
    if (typeof token === 'string') return `"${token}"`
    return String(token)
  }
}
