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

| API | Purpose |
|------|------|
| `getWindow(name)` | Get a single window (default `main`) |
| `sendTo(name, channel, ...args)` | `webContents.send` to a specific window |
| `broadcast(channel, ...args)` | Broadcast to all live windows |

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

Exact trigger order depends on implementation; see [Windows / Events / Lifecycle](/en/core/window-event-lifecycle).

## Next Steps

→ [Example Projects](./examples)
