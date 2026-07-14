import { META, readMetadata, type ModuleMetadata, type Provider } from '@electrum/common'
import { DIContainer } from '../di/container'

export interface ScannedModule {
  moduleClass: Function
  metadata: ModuleMetadata
  controllers: Function[]
  providers: Function[]
  declarations: Function[]
}

export class ModuleScanner {
  private visited = new Set<Function>()
  private results: ScannedModule[] = []

  constructor(private container: DIContainer) {}

  scan(rootModule: Function): ScannedModule[] {
    this.walk(rootModule)
    return this.results
  }

  private walk(moduleClass: Function): void {
    if (this.visited.has(moduleClass)) return
    this.visited.add(moduleClass)

    const metadata = readMetadata<ModuleMetadata>(moduleClass, META.MODULE)

    if (!metadata) {
      throw new Error(`${moduleClass.name} is not decorated with @Module`)
    }

    // Scan imports first so exported providers are available
    for (const imported of metadata.imports || []) {
      this.walk(imported)
    }

    const providerClasses: Function[] = []
    for (const provider of metadata.providers || []) {
      this.registerProvider(provider, providerClasses)
    }

    for (const controller of metadata.controllers || []) {
      this.container.register(controller, { useClass: controller })
    }

    this.results.push({
      moduleClass,
      metadata,
      controllers: metadata.controllers || [],
      providers: providerClasses,
      declarations: metadata.declarations || [],
    })
  }

  private registerProvider(provider: Provider, providerClasses: Function[]): void {
    if (typeof provider === 'function') {
      const injectableMeta = readMetadata<{ scope: 'singleton' | 'transient' }>(
        provider,
        META.INJECTABLE,
      )
      this.container.register(provider, {
        useClass: provider,
        scope: injectableMeta?.scope,
      })
      providerClasses.push(provider)
    } else if ('useValue' in provider) {
      this.container.register(provider.provide, { useValue: provider.useValue })
    } else if ('useClass' in provider) {
      this.container.register(provider.provide, { useClass: provider.useClass })
      providerClasses.push(provider.useClass)
    } else if ('useFactory' in provider) {
      this.container.register(provider.provide, {
        useFactory: provider.useFactory,
        inject: provider.inject,
      })
    }
  }
}
