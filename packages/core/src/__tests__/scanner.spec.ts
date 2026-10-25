import { describe, it, expect } from 'vitest'
import {
  Module,
  Injectable,
  Inject,
  Controller,
  WindowDeclaration,
} from '@electrum/common'
import { DIContainer } from '../di/container'
import { ModuleScanner } from '../module/scanner'

@Injectable()
class SharedService {
  value = 'shared'
}

@Module({
  providers: [SharedService],
})
class ChildModule {}

@WindowDeclaration({ name: 'main' })
class MainWindow {}

@Controller('child')
class ChildController {}

@Module({
  imports: [ChildModule],
  controllers: [ChildController],
  declarations: [MainWindow],
})
class RootModule {}

describe('ModuleScanner', () => {
  it('walks imports depth-first and registers providers/controllers', () => {
    const container = new DIContainer()
    const scanner = new ModuleScanner(container)
    const modules = scanner.scan(RootModule)

    expect(modules).toHaveLength(2)
    expect(modules[0].moduleClass).toBe(ChildModule)
    expect(modules[1].moduleClass).toBe(RootModule)
    expect(modules[1].controllers).toContain(ChildController)
    expect(modules[1].declarations).toContain(MainWindow)

    const shared = container.resolve(SharedService)
    expect(shared.value).toBe('shared')
  })

  it('deduplicates visited modules', () => {
    @Module({ imports: [ChildModule, ChildModule] })
    class DuplicateImportsModule {}

    const container = new DIContainer()
    const scanner = new ModuleScanner(container)
    const modules = scanner.scan(DuplicateImportsModule)

    expect(modules.filter((m) => m.moduleClass === ChildModule)).toHaveLength(1)
  })

  it('throws when module is missing @Module metadata', () => {
    class NotAModule {}

    const container = new DIContainer()
    const scanner = new ModuleScanner(container)

    expect(() => scanner.scan(NotAModule)).toThrow(/not decorated with @Module/)
  })

  it('registers useValue and useFactory providers', () => {
    @Module({
      providers: [
        { provide: 'CONFIG', useValue: { env: 'test' } },
        {
          provide: 'GREETING',
          useFactory: (config: { env: string }) => `hello-${config.env}`,
          inject: ['CONFIG'],
        },
      ],
    })
    class ConfigModule {}

    const container = new DIContainer()
    const scanner = new ModuleScanner(container)
    scanner.scan(ConfigModule)

    expect(container.resolve('GREETING')).toBe('hello-test')
  })

  it('inherits @Injectable({ scope }) for useClass providers', () => {
    @Injectable({ scope: 'request' })
    class ScopedService {}

    @Module({ providers: [{ provide: 'SCOPED', useClass: ScopedService }] })
    class ScopedModule {}

    const container = new DIContainer()
    new ModuleScanner(container).scan(ScopedModule)

    const node = container.getDependencyGraph().find((n) => n.token === '"SCOPED"')
    expect(node?.scope).toBe('request')

    const proxy = container.resolve<{ value: number }>('SCOPED')
    expect(() => proxy.value).toThrow(/outside of a request scope/)
  })
})

describe('ModuleScanner — exports visibility', () => {
  @Injectable()
  class PublicService {}

  @Injectable()
  class PrivateService {}

  @Injectable()
  class OkConsumer {
    @Inject(PublicService)
    dep!: PublicService
  }

  @Injectable()
  class BadConsumer {
    @Inject(PrivateService)
    dep!: PrivateService
  }

  @Module({ providers: [PublicService, PrivateService], exports: [PublicService] })
  class LibModule {}

  @Module({ imports: [LibModule], providers: [OkConsumer] })
  class AppModuleOk {}

  @Module({ imports: [LibModule], providers: [BadConsumer] })
  class AppModuleBad {}

  it('allows providers listed in exports', () => {
    const container = new DIContainer()
    new ModuleScanner(container).scan(AppModuleOk)

    const instance = container.resolve<OkConsumer>(OkConsumer, AppModuleOk)
    expect(instance.dep).toBeInstanceOf(PublicService)
  })

  it('rejects providers missing from exports', () => {
    const container = new DIContainer()
    new ModuleScanner(container).scan(AppModuleBad)

    expect(() => container.resolve<BadConsumer>(BadConsumer, AppModuleBad)).toThrow(
      /not visible/,
    )
  })

  it('keeps legacy behavior when exports is not declared', () => {
    @Module({ providers: [PrivateService] })
    class LegacyModule {}

    @Module({ imports: [LegacyModule], providers: [BadConsumer] })
    class LegacyApp {}

    const container = new DIContainer()
    new ModuleScanner(container).scan(LegacyApp)

    const instance = container.resolve<BadConsumer>(BadConsumer, LegacyApp)
    expect(instance.dep).toBeInstanceOf(PrivateService)
  })
})
