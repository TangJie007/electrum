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
| `declarations` | Window declaration classes (with `@WindowDeclaration`) |

## Splitting by Feature

Split modules by domain (e.g. `FileModule`, `UserModule`); the root module only assembles them. You can start with a single Controller + single Module and split gradually.

## Scan Order

1. Root module recursively `imports`
2. Each module's providers / controllers registered in the container
3. Then create windows, bind IPC, trigger lifecycle

The same module tree is scanned only once (visited set prevents cycles). A root class without `@Module` throws during scanning.

Deeper source walkthrough: [Module Scanning & DI](/en/core/di-and-modules) and [ModuleScanner Design](/en/core/module-scanner).

## Next Steps

→ [Middleware Pipeline](./middleware)
