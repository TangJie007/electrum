import { META, readMetadata } from '../constants/metadata-keys'
import type { InjectionPoint } from '../decorators/inject.decorator'
import type { Scope } from '../decorators/injectable.decorator'

type Token = Function | string | symbol

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
  private resolving = new Set<Token>()
  private windowProvider: (name: string) => any | undefined = () => undefined

  setWindowProvider(fn: (name: string) => any | undefined): void {
    this.windowProvider = fn
  }

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
    if (typeof token === 'symbol') {
      const tokenStr = token.description || ''
      if (tokenStr.startsWith('emvc:window:')) {
        const windowName = tokenStr.replace('emvc:window:', '')
        const win = this.windowProvider(windowName)
        if (!win) throw new Error(`Window "${windowName}" not found`)
        return win as T
      }
    }

    if (this.singletons.has(token)) {
      return this.singletons.get(token)
    }

    if (this.resolving.has(token)) {
      throw new Error(
        `Circular dependency detected: ${this.formatToken(token)} ` +
          `is being resolved while already in chain: ` +
          `[${[...this.resolving].map((t) => this.formatToken(t)).join(' → ')}]`,
      )
    }

    const record = this.providers.get(token)

    if (record && 'useValue' in record && record.useValue !== undefined) {
      if (record.scope === 'singleton') this.singletons.set(token, record.useValue)
      return record.useValue
    }

    if (record?.useFactory) {
      const injectTokens = record.inject || []
      const args = injectTokens.map((t) => this.resolve(t))
      const instance = record.useFactory(...args)
      if (record.scope === 'singleton') this.singletons.set(token, instance)
      return instance
    }

    const targetClass = record?.useClass || (typeof token === 'function' ? token : null)
    if (!targetClass) {
      throw new Error(`No provider found for token: ${this.formatToken(token)}`)
    }

    this.resolving.add(token)

    try {
      const instance = new (targetClass as any)()
      const injections = readMetadata<InjectionPoint[]>(targetClass, META.INJECTIONS) || []

      for (const injection of injections) {
        if (injection.type === 'window') {
          const win = this.windowProvider(injection.windowName!)
          if (win) {
            instance[injection.propertyKey] = win
          } else {
            throw new Error(
              `Window "${injection.windowName}" not found for injection in ${targetClass.name}`,
            )
          }
        } else if (injection.type === 'optional') {
          if (this.has(injection.token)) {
            instance[injection.propertyKey] = this.resolve(injection.token)
          }
        } else {
          instance[injection.propertyKey] = this.resolve(injection.token)
        }
      }

      const finalScope = record?.scope || 'singleton'
      if (finalScope === 'singleton') {
        this.singletons.set(token, instance)
      }

      return instance
    } finally {
      this.resolving.delete(token)
    }
  }

  has(token: Token): boolean {
    if (typeof token === 'symbol') {
      const desc = token.description || ''
      if (desc.startsWith('emvc:window:')) return true
    }
    return this.providers.has(token) || this.singletons.has(token)
  }

  clear(): void {
    this.singletons.clear()
    this.providers.clear()
    this.resolving.clear()
  }

  private formatToken(token: Token): string {
    if (typeof token === 'function') return token.name || '<anonymous>'
    if (typeof token === 'string') return `"${token}"`
    return String(token)
  }
}
