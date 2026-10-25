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
| `exports` | Whitelist of Providers exposed to other modules; **omitted = everything is visible** (see below) |
| `declarations` | Window declaration classes (with `@WindowDeclaration`) |

## Splitting by Feature

Split modules by domain (e.g. `FileModule`, `UserModule`); the root module only assembles them. You can start with a single Controller + single Module and split gradually.

## Scan Order

1. Root module recursively `imports`
2. Each module's providers / controllers registered in the container
3. Then create windows, bind IPC, trigger lifecycle

The same module tree is scanned only once (visited set prevents cycles). A root class without `@Module` throws during scanning.

Module scanning registers Providers and resolves imports; the table above covers day-to-day usage.

## Provider Visibility (`exports`)

By default every Provider in a module is visible application-wide. Declare an `exports` whitelist to keep some of them module-private:

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

Rules (Nest-compatible, but backward compatible too):

| Owner (module that registered the Provider) | Can the consumer inject it? |
|---|---|
| Consumer itself | ✅ always visible |
| Owner did not declare `exports` | ✅ visible application-wide (legacy behavior) |
| Owner declared `exports` including this token | ✅ visible |
| Owner declared `exports` without this token | ❌ throws |
| Reached indirectly through the `imports` chain | ✅ only if every intermediate module that declares `exports` re-exports it |

Two easy traps:

- **`exports: []` is strict mode**—an empty array means "export nothing", not "export everything".
- **Re-exports are per hop**: with `A imports B imports C`, if `B` declares its own `exports`, then `C`'s Provider must appear in `B`'s `exports` for `A` to see it.

> `ModuleRegistry` (the class implementing this visibility check) is an internal part of `@electrum/core`, held privately by `DIContainer`. Application code only writes the `@Module({ exports })` array—it never needs to and **should not** instantiate or call `ModuleRegistry` directly.

## Next Steps

→ [Middleware Pipeline](./middleware)
