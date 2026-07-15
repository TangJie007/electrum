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

Beyond plain classes, `useClass` / `useValue` / `useFactory` are supported:

```ts
@Module({
  providers: [
    ConfigService,
    {
      provide: 'APP_CONFIG',
      useFactory: () => ({
        appName: 'Electrum Demo',
        version: '0.1.0',
      }),
    },
  ],
})
export class AppModule {}
```

Inject a custom token:

```ts
@Inject('APP_CONFIG')
config!: { appName: string; version: string }
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
