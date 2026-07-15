# Controllers

Controllers handle **incoming IPC requests** and return results to the renderer process (or other callers).

A Controller typically corresponds to a group of related channels. The routing mechanism (channel naming here) decides which method handles each request. A single Controller can host multiple handlers, each doing something different.

Creating a Controller uses **classes + decorators**. Decorators associate the class with the metadata Electrum needs so that at startup it can build a "channel → method" mapping and wire it to Electron's `ipcMain`.

::: tip Note
A Controller in Electrum is **not** an HTTP Controller. The rough mapping is: NestJS routes ↔ Electron IPC channels; `@Get()` / `@Post()` ↔ `@IpcHandle()` / `@IpcOn()`.

**Keep directions straight:**

| Direction | Electrum approach |
|------|----------------|
| Renderer → Main (request-response) | `@IpcHandle` + renderer `invoke` |
| Renderer → Main (one-way) | `@IpcOn` + renderer `send` |
| Main → Renderer (push) | `@IpcEmit` + Controller `window` (or `webContents.send` / `sendTo` / `event.reply`), renderer `on` |

`@IpcHandle` / `@IpcOn` **only register main-process inbound listeners**. For main-process pushes to the UI, use `@IpcEmit`—see [Main → Renderer](#main--renderer) below.
:::

## Channel Prefix (Routing)

Use `@Controller()` to declare a Controller. Pass a string prefix, or an object to also specify a default push window:

```ts
@Controller('file')
// or
@Controller({ prefix: 'file', window: 'main' })
```

The prefix groups related handlers / emits. For example, file-related IPC all lives under the `file` prefix:

```ts
import { Controller, IpcHandle, Inject } from '@electrum/common'
import { FileService } from './file.service'

@Controller({ prefix: 'file', window: 'main' })
export class FileController {
  @Inject(FileService)
  fileService!: FileService

  @IpcHandle('read')
  async read(filePath: string): Promise<string> {
    return this.fileService.read(filePath)
  }
}
```

`@IpcHandle('read')` on a method tells the framework to register an `ipcMain.handle` for it. The full channel name is **Controller prefix + method channel**:

```
fullChannel = prefix ? `${prefix}:${channel}` : channel
```

In the example above, the renderer should call `file:read`:

```ts
// preload / renderer
import { createClient } from '@electrum/client'

const api = createClient<IpcApi>()
const content = await api.file.read('/path/to/file')
```

If the Controller prefix is `file` and the method decorator is `@IpcHandle('write')`, the channel is `file:write`. Method names themselves (e.g. `read`, `write`) are arbitrary—the framework does not route by method name.

You can also omit a prefix:

```ts
@Controller()
export class AppController {
  @IpcHandle('ping')
  ping() {
    return 'pong'
  }
}
// channel is simply ping
```

## `@IpcHandle`

Corresponds to Electron's `ipcMain.handle`. The renderer uses **`ipcRenderer.invoke`** (exposed as `window.api.invoke` via `@electrum/preload`, or `api.xxx.yyy()` via `@electrum/client`) for a **request-response** call; the value (or Promise) returned by the main-process method goes back to the caller.

**Good for:**

- CRUD, reading config, reading files, computing and returning results—"ask once, answer once"
- Business logic that needs `await` and errors propagated to the renderer
- Full middleware (Guard / Pipe / Interceptor / Filter)
- Generating renderer-side type skeletons (`generateTypes` only scans `@IpcHandle`)

**Method signature:** `(...args)`—the framework strips `event`; you only write business parameters.

```ts
@Controller('user')
export class UserController {
  @Inject(UserService)
  users!: UserService

  // renderer: await api.user.list()  or  window.api.invoke('user:list')
  @IpcHandle('list')
  list() {
    return this.users.list()
  }

  // renderer: await api.user.get(1)
  @IpcHandle('get')
  get(id: number) {
    return this.users.get(id)
  }
}
```

Optional `{ devOnly: true }`: registers only in development—useful for debug channels.

Both synchronous `return` and `async` work. Exceptions are caught by Filters into `IpcErrorResponse` instead of crashing IPC outright.

::: tip Return and push at once
Inside a Handle you can use `@IpcEmit` to notify the renderer proactively (see below)—no need to hand-write `webContents.send`:

```ts
@IpcEmit('saved')
notifySaved!: (path: string) => void

@IpcHandle('write')
async write(data: { path: string; content: string }) {
  await this.fileService.write(data.path, data.content)
  this.notifySaved(data.path)
  return { ok: true as const, path: data.path }
}
```
:::

## `@IpcOn`

Corresponds to Electron's `ipcMain.on`. The renderer uses **`ipcRenderer.send`** (often `window.api.send` in examples) for a **one-way message**; there is **no** automatic return value from the main process back to the renderer for that call.

**Good for:**

- Notifications only, no return value needed (telemetry, cancel, start listening)
- Needing `IpcMainEvent` and `event.reply(...)` for **multiple / ongoing** pushes (file watch, progress, subscriptions)
- Needing capabilities on the event object such as `event.sender`

**Method signature:** `(event, ...args)`—first argument is the Electron event.

Middleware runs **Guards only**—not Pipe / Interceptor / Filter.

```ts
import type { IpcMainEvent } from 'electron'

@Controller('file')
export class FileController {
  // renderer: window.api.send('file:watch', path)
  // main process can continuously event.reply('file:changed', ...)
  @IpcOn('watch')
  onWatch(event: IpcMainEvent, filePath: string): void {
    this.fileService.watch(filePath, (change) => {
      event.reply('file:changed', { path: filePath, ...change })
    })
  }
}
```

The channel name in `event.reply` is a separate channel you define—the renderer must `ipcRenderer.on('file:changed', ...)` (or use preload's exposed `on`).

## How to Choose

| Scenario | Use |
|------|-----|
| Need a result after calling / use `await` | `@IpcHandle` |
| Main process pushes to renderer proactively | `@IpcEmit` |
| One call, multiple pushes or long-lived subscription | `@IpcOn` + `event.reply` |
| Notify main only, no return value | `@IpcOn` (Handle works too, but On is a better fit) |
| Need full Guard→Pipe→Filter chain | `@IpcHandle` |
| Dev-only debug channel | `@IpcHandle(..., { devOnly: true })` |

Prefer `@IpcHandle` for everyday business logic; reach for `@IpcOn` when you need event streams.

## Main → Renderer

Recommended approach: **`@IpcEmit`** (property injection)—calling the field function sends via `webContents.send` to the target window. Channel naming matches `@IpcHandle` (`prefix:channel`). Target window: `@IpcEmit`'s `window` → Controller's `window` → default `'main'`; pass `'broadcast'` to fan out to all windows.

```ts
@Controller({ prefix: 'file', window: 'main' })
export class FileController {
  @IpcEmit('saved')
  notifySaved!: (path: string) => void

  @IpcEmit('toast', { window: 'broadcast' })
  toastAll!: (msg: string) => void

  @IpcHandle('write')
  async write(data: { path: string; content: string }) {
    await this.fileService.write(data.path, data.content)
    this.notifySaved(data.path) // → file:saved pushed to main
    return { ok: true as const, path: data.path }
  }
}

// renderer: window.api.on('file:saved', (path) => { ... })
```

Emit does **not** go through Guard / Pipe / Interceptor / Filter (outbound push, not inbound IPC).

### Other Approaches (Supplement)

| Approach | When to use |
|------|------|
| `@WindowRef` + `webContents.send` | Need direct `BrowserWindow` access |
| `WindowManager.sendTo` / `broadcast` | Cross-module / plugin pushes via manager |
| `event.reply` inside `@IpcOn` | Reply to **this request's sender** (subscription, progress, watch) |

```ts
@IpcOn('watch')
onWatch(event: IpcMainEvent, filePath: string): void {
  this.fileService.watch(filePath, (change) => {
    event.reply('file:changed', { path: filePath, ...change })
  })
}
```

```
Renderer ──invoke──► @IpcHandle ──return──► Renderer     (request-response)
Renderer ──send────► @IpcOn                              (one-way into main)
Main ──@IpcEmit / sendTo / reply──► Renderer             (main-process push)
```

## Register in a Module

A Controller must appear in some `@Module`'s `controllers` array to be scanned and wired:

```ts
import { Module } from '@electrum/common'
import { FileController } from './file.controller'
import { FileService } from './file.service'

@Module({
  controllers: [FileController],
  providers: [FileService],
})
export class FileModule {}
```

At startup, `createApp(AppModule).start()` resolves each Controller and `IpcBridge` registers them on `ipcMain` by `prefix:channel`. You do not hand-write `ipcMain.handle` in business code.

Duplicate channel names log a warning and are skipped to avoid a second `handle` crash.

## Dev-Only Channels

```ts
@IpcHandle('debugDump', { devOnly: true })
debugDump() {
  return { /* ... */ }
}
```

When `devOnly: true`, registration is skipped outside development.

## Working with Middleware

Use `@UseGuards` / `@UsePipes` / `@UseInterceptors` / `@UseFilters` on a class or method. Merge order: **global → class → method**.

```ts
import { Controller, IpcHandle, UseInterceptors } from '@electrum/common'
import { LoggingInterceptor } from '../interceptors/logging.interceptor'

@Controller('file')
@UseInterceptors(LoggingInterceptor)
export class FileController {
  @IpcHandle('read')
  read(filePath: string) {
    return '...'
  }
}
```

See [Middleware Pipeline](./middleware): [Guard](./guards) · [Pipe](./pipes) · [Interceptor](./interceptors) · [Filter](./filters).

## Type Skeleton (Optional)

Scan all `@IpcHandle` handlers to generate a renderer-side declaration skeleton:

```ts
createApp(AppModule).generateTypes('src/renderer/types/api.d.ts')
```

Currently generates a starter skeleton mapping channel names → `any`; tighten parameter types manually as needed, or wire richer type generation later.

## Full Example

The repository's [`examples/basic`](https://github.com/TangJie007/electrum/tree/main/examples/basic) `FileController` / `UserController` demonstrate Handle, On, window injection, and Interceptor.

## Next Steps

→ [Providers](./providers)  
→ [Preload](./preload) / [Client](./client) (how the renderer calls these channels)
