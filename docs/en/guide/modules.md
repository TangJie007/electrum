# Modules

Modules are the basic unit for organizing application structure. Every app has at least one **root module** (the one passed to `createApp`). A module is described with `@Module()`: which Controllers / Providers it contains, which child modules it imports, and window declarations.

```ts
import { Module } from '@electrum/common'
import { UserController } from './user.controller'
import { UserService } from './user.service'
import { FileModule } from '../file/file.module'

@Module({
  imports: [FileModule],
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule {}
```

The root module is then passed to `createApp`:

```ts
@Module({
  imports: [WindowModule, FileModule, UserModule],
  controllers: [AppController],
  providers: [ConfigService],
})
export class AppModule {}

await createApp(AppModule).start()
```

## Metadata Fields

| Field | Meaning |
|------|------|
| `imports` | Child modules scanned first (DFS: imports before self) |
| `controllers` | IPC entry classes; registered in DI and bound by IpcBridge |
| `providers` | Injectable services; supports class / `useClass` / `useValue` / `useFactory` |
| `exports` | Whitelist of Providers exposed to other modules; **omitted = everything is private** (see below) |
| `declarations` | Window declaration classes (with `@WindowDeclaration`) |
| `global` | Same as `@Global()`; visible application-wide. Prefer the decorator |

## Splitting by Feature

Split modules by domain (e.g. `FileModule`, `UserModule`); the root module only assembles them. You can start with a single Controller + single Module and split gradually.

## Scan Order

1. Root module recursively `imports`
2. Each module's providers / controllers registered in the container
3. Then create windows, bind IPC, trigger lifecycle

The same module tree is scanned only once (visited set prevents cycles). A root class without `@Module` throws during scanning.

Module scanning registers Providers and resolves imports; the table above covers day-to-day usage.

## Provider Visibility (`exports`)

Providers are **private by default**—only what you list in `exports` is visible to other modules, same as Nest:

```ts
@Module({
  providers: [UserService, UserRepository],
  exports: [UserService], // expose only UserService
  controllers: [UserController],
})
export class UserModule {}

@Module({
  imports: [UserModule],
  controllers: [OrderController],
})
export class OrderModule {}
// ✅ OrderModule can inject UserService
// ❌ injecting UserRepository throws "not visible from OrderModule"
```

Rules:

| Owner (module that registered the Provider) | Can the consumer inject it? |
|---|---|
| Consumer itself | ✅ always visible |
| Owner did not declare `exports` | ❌ private |
| Owner's `exports` includes this token | ✅ visible (consumer must reach owner through `imports`) |
| Owner's `exports` excludes this token | ❌ throws |
| Owner is marked `@Global()` | ✅ visible without `imports` |

### Re-exports

`exports` accepts **tokens** and **module classes**; both work across multiple hops:

```ts
@Module({ providers: [DeepService], exports: [DeepService] })
export class DeepModule {}

// Form 1: re-export the token
@Module({ imports: [DeepModule], exports: [DeepService] })
export class MidModule {}

// Form 2: re-export the whole module (equivalent to forwarding all its exports)
@Module({ imports: [DeepModule], exports: [DeepModule] })
export class MidModule2 {}

@Module({ imports: [MidModule] })
export class TopModule {} // ✅ can inject DeepService
```

An intermediate module that does **not** declare `exports` does not forward anything—you must re-export explicitly, exactly like Nest.

### Global modules

`@Global()` modules need no `imports` to be injected anywhere. Use it for infrastructure such as config, logging, database connections:

```ts
@Global()
@Module({
  providers: [ConfigService, { provide: 'APP_CONFIG', useValue: {...} }],
  exports: [ConfigService, 'APP_CONFIG'],
})
export class ConfigModule {}
```

The order of `@Global()` and `@Module()` on the class does not matter.

> **Duplicate tokens**: when two modules register the same token, each module can inject the one it registered, but the **instance is shared** (the last registration wins). Nest keeps a separate injector per module; Electrum does not isolate instances yet—prefer string/symbol prefixes for same-named tokens.

> `ModuleRegistry` (the class implementing this visibility check) is an internal part of `@electrum/core`, held privately by `DIContainer`. Application code only declares `@Module({ exports })` / `@Global()`—it never needs to and **should not** instantiate or call `ModuleRegistry` directly.

## Next Steps

→ [Middleware Pipeline](./middleware)
