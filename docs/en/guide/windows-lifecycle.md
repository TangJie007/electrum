# Windows and Lifecycle

Windows and `app` events are separate from Controllers, but still plug into the same startup flow through Module `declarations` and `@WindowRef` / `@AppEvent`.

## Declarative Windows

Describe `BrowserWindow` with `@WindowDeclaration`, then add it to the module's `declarations`:

```ts
import { Module, WindowDeclaration } from '@electrum/common'
import { join } from 'node:path'

@WindowDeclaration({
  name: 'main',
  options: {
    width: 960,
    height: 680,
    title: 'Electrum Demo',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  },
  prodFile: join(__dirname, '../renderer/index.html'),
})
export class MainWindow {}

@Module({
  declarations: [MainWindow],
})
export class WindowModule {}
```

On startup: windows with `autoCreate !== false` are created automatically.  
In development, `ELECTRON_RENDERER_URL` or `devUrl` is loaded first; in production, `prodFile` is loaded.

## Injecting Windows

```ts
import { WindowRef } from '@electrum/common'
import type { BrowserWindow } from 'electron'

@WindowRef('main')
mainWin!: BrowserWindow
```

Resolution fails if the window is not yet created or does not exist—the framework startup order is **windows first, then IPC**.

## Common WindowManager APIs

Get the manager from the `Application` returned by `createApp`:

```ts
import { createApp } from '@electrum/core'
import { AppModule } from './app.module'

const app = createApp(AppModule)
await app.start()

const wm = app.getWindowManager()
```

| API | Purpose |
|------|------|
| `getWindow(name)` | Get a single window (default `main`) |
| `getAllWindows()` | All windows currently registered with the manager |
| `sendTo(name, channel, ...args)` | `webContents.send` to a specific window |
| `broadcast(channel, ...args)` | Broadcast to all live windows |

### `getWindow` — access a window and call native APIs

```ts
const main = wm.getWindow('main')
if (main && !main.isDestroyed()) {
  main.setTitle('Electrum Admin')
  main.focus()
}

// Omitting `name` defaults to `'main'`
wm.getWindow()?.minimize()
```

Useful in plugins, `onAppReady`, or any path where `@WindowRef` injection is awkward. Inside Controllers / Services the usual style remains:

```ts
import { WindowRef } from '@electrum/common'
import type { BrowserWindow } from 'electron'

@WindowRef('main')
mainWin!: BrowserWindow
```

### `sendTo` — push to one window

Channel names are arbitrary (they do not have to match an `@IpcHandle` prefix). The renderer listens via the preload `on` bridge or `ipcRenderer.on`.

```ts
// Main: notify only the main window
wm.sendTo('main', 'app:status', { online: true })

// e.g. after the settings window changes theme, refresh that window
wm.sendTo('settings', 'theme:changed', { theme: 'light' })
```

Renderer (`@electrum/client`):

```ts
import { createClient } from '@electrum/client'

const api = createClient()
api.on('app:status', (payload) => {
  console.log(payload.online)
})
```

For one-to-one pushes from a Controller, prefer `@IpcEmit` (channel includes the Controller `prefix` and goes through DI)—see [Controllers](./controllers). Use `sendTo` across modules, in plugins, or whenever you have no Controller context.

### `broadcast` — notify every live window

When every window must hear the same event:

```ts
// Main: every non-destroyed window receives this
wm.broadcast('session:expired', { reason: 'logout' })
wm.broadcast('config:reload')
```

```ts
// Renderer (each window listens on its own)
api.on('session:expired', () => {
  // clear local state / go to login
})
```

Equivalent to calling `sendTo` for each managed window. `@IpcEmit(..., { window: 'broadcast' })` uses this path under the hood.

## Application Events with `@AppEvent`

Bind Electron `app` events to Controller / Provider methods:

```ts
import { AppEvent } from '@electrum/common'

@AppEvent('window-all-closed')
onAllClosed() {
  // ...
}
```

During scanning, `@AppEvent` on controllers + providers registers `app.on(...)`.

## Lifecycle Hooks

Implement optional interfaces on classes that enter DI:

| Hook | When |
|------|------|
| `onModuleInit` | After module-related instances are ready |
| `onAppReady` | When the application is ready |
| `onModuleDestroy` | On teardown / exit cleanup |

Exact order: `onModuleInit` → `onAppReady`; on exit, `onModuleDestroy` runs (tied into `before-quit` cleanup).

## Next Steps

→ [Example Projects](./examples)
