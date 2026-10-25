import { describe, it, expect } from 'vitest'
import { Module, Global, Injectable, Inject } from '@electrum/common'

import { DIContainer } from '../di/container'
import { ModuleScanner } from '../module/scanner'
import { buildModuleGraph, toMermaid } from '../module/graph'

@Injectable()
class ConfigService {
  value = 1
}

@Injectable()
class Plain {
  @Inject('MISSING')
  missing: unknown
}

function graphOf(rootModule: Function) {
  const container = new DIContainer()
  const modules = new ModuleScanner(container).scan(rootModule)
  return {
    container,
    graph: buildModuleGraph(modules, container.getModuleRegistry(), container),
  }
}

describe('ModuleScanner — static graph validation', () => {
  it('rejects imports that are not decorated with @Module', () => {
    class NotAModule {}

    @Module({ imports: [NotAModule] })
    class AppModule {}

    expect(() => new ModuleScanner(new DIContainer()).scan(AppModule)).toThrow(
      /NotAModule is not decorated with @Module/,
    )
  })

  it('rejects exporting a token nobody in the subtree provides', () => {
    @Module({ exports: ['UNKNOWN_TOKEN'] })
    class AppModule {}

    expect(() => new ModuleScanner(new DIContainer()).scan(AppModule)).toThrow(
      /exports "UNKNOWN_TOKEN" which is not provided/,
    )
  })

  it('rejects re-exporting a module that was never imported', () => {
    @Module({ providers: [ConfigService], exports: [ConfigService] })
    class ConfigModule {}

    @Module({ exports: [ConfigModule] })
    class AppModule {}

    expect(() => new ModuleScanner(new DIContainer()).scan(AppModule)).toThrow(
      /re-exports module ConfigModule but never imports it/,
    )
  })

  it('accepts exporting a token provided by an imported module', () => {
    @Module({ providers: [ConfigService], exports: [ConfigService] })
    class ConfigModule {}

    @Module({ imports: [ConfigModule], exports: [ConfigService] })
    class AppModule {}

    const container = new DIContainer()
    expect(() => new ModuleScanner(container).scan(AppModule)).not.toThrow()
    expect(container.resolve(ConfigService, AppModule).value).toBe(1)
  })

  it('accepts the same token provided by several modules (isolated, not a conflict)', () => {
    @Module({ providers: [{ provide: 'TAG', useValue: 'a' }], exports: ['TAG'] })
    class ModuleA {}

    @Module({ providers: [{ provide: 'TAG', useValue: 'b' }], exports: ['TAG'] })
    class ModuleB {}

    @Module({ imports: [ModuleA, ModuleB] })
    class AppModule {}

    const container = new DIContainer()
    expect(() => new ModuleScanner(container).scan(AppModule)).not.toThrow()
    expect(container.resolve('TAG', ModuleA)).toBe('a')
    expect(container.resolve('TAG', ModuleB)).toBe('b')
  })
})

describe('buildModuleGraph / toMermaid', () => {
  @Global()
  @Module({ providers: [ConfigService], exports: [ConfigService] })
  class GlobalConfigModule {}

  @Module({ providers: [Plain] })
  class FeatureModule {}

  @Module({ imports: [GlobalConfigModule, FeatureModule], exports: [GlobalConfigModule] })
  class AppModule {}

  it('describes modules, providers and import edges', () => {
    const { graph } = graphOf(AppModule)
    const app = graph.modules.find((mod) => mod.name === 'AppModule')
    const feature = graph.modules.find((mod) => mod.name === 'FeatureModule')
    const globalConfig = graph.modules.find((mod) => mod.name === 'GlobalConfigModule')

    expect(app?.imports).toEqual(['GlobalConfigModule', 'FeatureModule'])
    expect(app?.exports).toEqual(['GlobalConfigModule'])
    expect(feature?.providers).toEqual([{ token: 'Plain', scope: 'singleton' }])
    expect(globalConfig?.global).toBe(true)

    expect(graph.edges).toEqual(
      expect.arrayContaining([
        { from: 'AppModule', to: 'GlobalConfigModule', kind: 'import' },
        { from: 'AppModule', to: 'FeatureModule', kind: 'import' },
        { from: 'AppModule', to: 'GlobalConfigModule', kind: 'export-module' },
      ]),
    )
  })

  it('renders a mermaid flowchart with a dashed line for module re-exports', () => {
    const { graph } = graphOf(AppModule)
    const mermaid = toMermaid(graph)

    expect(mermaid).toContain('flowchart TD')
    expect(mermaid).toContain('m_AppModule --> m_FeatureModule')
    expect(mermaid).toContain('m_AppModule -.-> m_GlobalConfigModule')
    expect(mermaid).toContain('(@Global)')
  })
})
