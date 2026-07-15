# Guard

Guards are responsible for **access control only**: before Pipes, Interceptors, and business methods run, they decide whether the call may proceed.

If `canActivate` returns `false` → throws `ForbiddenException` → [Filter](./filters) turns it into a structured error returned to the renderer process.

Guards **do not** transform parameters (that is [Pipe](./pipes)), and **do not** wrap calls before/after execution (that is [Interceptor](./interceptors)).

See [Middleware Pipeline](./middleware) for an overview.

## Interface and Context

```ts
import type { CanActivate, IpcContext } from '@electrum/common'

canActivate(context: IpcContext): boolean | Promise<boolean>
```

| Field | Description |
|------|------|
| `channel` | Full channel name, e.g. `user:remove` |
| `event` | Electron `IpcMainInvokeEvent` / `IpcMainEvent` (use `event.sender` when needed) |
| `args` | Business arguments passed from the renderer process |
| `controllerClass` / `instance` | Target Controller |

## Mounting

```ts
import { Injectable, UseGuards, Controller, IpcHandle } from '@electrum/common'
import type { CanActivate, IpcContext } from '@electrum/common'

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(ctx: IpcContext): boolean {
    return true
  }
}

// Class-level: all Handle / On handlers on this Controller pass through
@UseGuards(AuthGuard)
@Controller('secure')
export class SecureController {
  @IpcHandle('action')
  action() {
    return { ok: true }
  }
}

// Method-level: only a specific channel is guarded
@Controller('user')
export class UserController {
  @UseGuards(AuthGuard)
  @IpcHandle('remove')
  remove(id: number) {
    /* ... */
  }
}
```

You can also use `app.useGlobalGuards(AuthGuard)`. Merge order: **global → class → method**.

## Use Cases

### 1. Auth / Roles: Allow Sensitive IPC Only

Desktop apps often have a "current session user / admin mode". Attach Guards to write operations; read-only endpoints may omit them.

```ts
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: IpcContext): boolean {
    const session = /* SessionService injected via DI */ getSession()
    return session?.role === 'admin'
  }
}

@Controller('user')
export class UserController {
  @UseGuards(AdminGuard)
  @IpcHandle('remove')
  remove(id: number) {
    /* delete user */
  }
}
```

### 2. Channel Whitelist / Feature Flags

Block a batch of channels in one place, or disable entire features by configuration, instead of scattering `if` checks across every Controller.

```ts
@Injectable()
export class FeatureFlagGuard implements CanActivate {
  canActivate(ctx: IpcContext): boolean {
    if (ctx.channel.startsWith('experimental:')) {
      return process.env.ENABLE_EXPERIMENTAL === '1'
    }
    return true
  }
}

// app.useGlobalGuards(FeatureFlagGuard)
```

### 3. Validate Calling Window

With multiple windows, use `event.sender` to decide whether a window may invoke sensitive channels (e.g. only the main window can change settings).

```ts
import { BrowserWindow } from 'electron'

@Injectable()
export class MainWindowOnlyGuard implements CanActivate {
  canActivate(ctx: IpcContext): boolean {
    const win = BrowserWindow.fromWebContents(ctx.event.sender)
    return win?.getTitle().includes('Admin') === true
    // or compare win.id / pre-registered webContents.id
  }
}
```

### 4. Parameter-Level Gate (Coarse Validation)

Quickly reject based on `args` before Pipes run. Full validation and DTO shaping should still go to [Pipe](./pipes).

```ts
@Injectable()
export class HasIdGuard implements CanActivate {
  canActivate(ctx: IpcContext): boolean {
    const id = ctx.args[0]
    return typeof id === 'number' && id > 0
  }
}
```

### 5. `@IpcOn` Subscription Access

`@IpcOn` **runs Guards only** (not Pipe / Interceptor / Filter). Suitable for one-way entry points such as "may this client start watching / subscribing to a path".

```ts
import type { IpcMainEvent } from 'electron'

@UseGuards(PathAllowedGuard)
@IpcOn('watch')
onWatch(event: IpcMainEvent, filePath: string) {
  // Only reached after Guard passes
}
```

## Boundaries with Other Middleware

| Need | Use |
|------|----|
| Whether the call is allowed | **Guard** |
| How parameters become valid shape | [Pipe](./pipes) |
| Logging, timing, return value wrapping | [Interceptor](./interceptors) |
| How exceptions reach the renderer | [Filter](./filters) |

## Next Steps

→ [Pipe](./pipes)  
← [Middleware Pipeline](./middleware)
