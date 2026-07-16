# Providers

Providers are the fundamental injectable concept in Electrum—the most common form is a **Service**: encapsulating business logic called by Controllers or other Providers.

Mark a class with `@Injectable()` to add it to a module's `providers`, then inject it where needed via `@Inject`.

::: tip Note
Electrum DI **does not use constructor parameter injection** (Stage 3 decorators lack a mature parameter-decorator path). It uses **property injection**: mark a field with `@Inject`; the value is assigned at `resolve` time.
:::

## Service Example

```ts
import { Injectable, Inject } from '@electrum/common'

@Injectable()
export class Logger {
  log(msg: string) {
    console.log(msg)
  }
}

@Injectable()
export class UserService {
  @Inject(Logger)
  logger!: Logger

  list() {
    this.logger.log('list users')
    return []
  }
}
```

Declare in a module:

```ts
@Module({
  providers: [Logger, UserService],
  controllers: [UserController],
})
export class UserModule {}
```

During scanning, only `register` (record the recipe) runs; `resolve` happens when IPC is bound or lifecycle fires—only then do `@Inject` fields get values.

## Mental Model

```
Decorators don't inject—they only write "field X needs token Y"
register doesn't create objects—it only records recipes
resolve does the work: new Cls() → read @Inject → recursively resolve → assign to fields
```

## Common Decorators

| Decorator | Purpose |
|--------|------|
| `@Injectable()` | Mark an injectable class (convention; aligns with Nest) |
| `@Inject(token)` | Field injection; token can be a class or string / symbol |
| `@Optional()` | Do not throw on resolve failure (for optional dependencies) |
| `@WindowRef(name)` | Inject the `BrowserWindow` named `name` |

## Custom Providers

Besides plain classes (`providers: [UserService]`), three object forms are supported. Pattern: `provide` is the injection **token**; the rest says how to produce the value.

| Form | Syntax | When to use |
|------|--------|-------------|
| Class | `UserService` | Everyday Services / injectable classes |
| `useValue` | `{ provide, useValue }` | Constants, config objects, existing instances |
| `useClass` | `{ provide, useClass }` | Interface token ↔ implementation; test doubles |
| `useFactory` | `{ provide, useFactory, inject? }` | Build a value after resolving other Providers |

Each form follows: **register in the module → `@Inject(token)` on a field → use it in business methods**.

### useValue — provide a value as-is

**Use when**: config constants, feature flags, or a third-party object you already have (no `new`).

```ts
// 1. Register
@Module({
  providers: [
    ApiClient,
    { provide: 'API_URL', useValue: 'https://api.example.com' },
    { provide: 'FEATURE_FLAGS', useValue: { hmr: true, dark: false } },
  ],
})
export class AppModule {}

// 2. Inject and use
@Injectable()
export class ApiClient {
  @Inject('API_URL')
  apiUrl!: string

  @Inject('FEATURE_FLAGS')
  flags!: { hmr: boolean; dark: boolean }

  fetchUsers() {
    if (!this.flags.hmr) console.log('HMR off')
    return fetch(`${this.apiUrl}/users`) // use the injected constant
  }
}
```

`resolve` returns that value directly (cached as singleton by default).

### useClass — separate token from implementation

**Use when**: inject via an abstract / string token and swap implementations (mock in tests, real in prod).

```ts
// 1. Abstract + implementations
abstract class Storage {
  abstract read(key: string): string
}

@Injectable()
class FileStorage extends Storage {
  read(key: string) {
    return `file:${key}`
  }
}

@Injectable()
class MemoryStorage extends Storage {
  private data = new Map<string, string>()
  read(key: string) {
    return this.data.get(key) ?? ''
  }
}

// 2. Register: token is Storage, instance is FileStorage
@Module({
  providers: [
    SettingsService,
    { provide: Storage, useClass: FileStorage },
    // In tests: { provide: Storage, useClass: MemoryStorage }
  ],
})
export class AppModule {}

// 3. Inject and use (depend on the abstract type only)
@Injectable()
export class SettingsService {
  @Inject(Storage)
  storage!: Storage

  getTheme() {
    return this.storage.read('theme') // calls FileStorage.read
  }
}
```

Equivalent to “token = `Storage`, create with `new FileStorage()` then property-inject.”

### useFactory — assemble with a factory

**Use when**: creation depends on other Providers, env vars, or branching logic.

```ts
// 1. Register (with or without inject)
@Module({
  providers: [
    ConfigService,
    BannerService,
    {
      provide: 'APP_CONFIG',
      useFactory: () => ({
        appName: 'Electrum Demo',
        version: '0.1.0',
      }),
    },
    {
      provide: 'BANNER',
      inject: ['APP_CONFIG'],
      useFactory: (cfg: { appName: string; version: string }) =>
        `=== ${cfg.appName} v${cfg.version} ===`,
    },
  ],
})
export class AppModule {}

// 2. Inject and use factory products
@Injectable()
export class ConfigService {
  @Inject('APP_CONFIG')
  config!: { appName: string; version: string }

  get appName() {
    return this.config.appName // use the object returned by the factory
  }
}

@Injectable()
export class BannerService {
  @Inject('BANNER')
  banner!: string

  print() {
    console.log(this.banner) // === Electrum Demo v0.1.0 ===
  }
}
```

- `inject`: tokens for factory arguments; resolved before the factory runs  
- Without `inject`, the factory is called with no args (see `APP_CONFIG` above)

In `examples/basic`, `AppModule` + `ConfigService` is the full chain: `useFactory('APP_CONFIG')` → `@Inject('APP_CONFIG')` → `this.config.appName`.

### Choosing a form

```
Just need to new a class?              → plain class, or useClass
Already have a ready value?            → useValue
Need other deps before assembling?     → useFactory + inject
```

## Scope

Control instance lifecycle via `@Injectable({ scope })`:

| Scope | Behavior |
|-------|------|
| `'singleton'` (default) | Cached after first `resolve`; same instance reused |
| `'transient'` | Every `resolve` does `new` + property injection; no caching |

```ts
@Injectable()
class FileService {} // default singleton—one instance per app

@Injectable({ scope: 'transient' })
class RequestContext {} // new instance on every resolve
```

ModuleScanner reads `scope` when registering class Providers and passes it to `container.register`. Everyday Services / Controllers use the default singleton.

Note: if a **transient** service is only injected into a **singleton** Controller, it is typically created once when that Controller is first resolved and stays on that one Controller—it does not "new on every IPC." To create per-request instances, actively `resolve` on each call path (or use your own factory) rather than relying solely on field injection.

Finer container behavior (singleton / transient, circular dependency detection) is handled by `@electrum/core`'s DI container.

## Hands-On DI

The repository includes a teaching example [`examples/di`](https://github.com/TangJie007/electrum/tree/main/examples/di) that walks through polyfill → metadata → injectable → inject → container with minimal code:

```bash
cd examples/di
pnpm demo
pnpm start
```

In a full application you do not hand-write `container.register`; `@Module` + `ModuleScanner` handles bulk registration.

## Next Steps

→ [Modules](./modules)
