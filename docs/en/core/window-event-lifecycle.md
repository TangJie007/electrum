# Window, Event & Lifecycle

Corresponding source:

- `packages/core/src/window/manager.ts`
- `packages/core/src/bridge/event-bridge.ts`
- `packages/core/src/lifecycle/manager.ts`

## 1. WindowManager

### Declarative Creation

`@Module({ declarations: [MainWindow] })` + `@WindowDeclaration({ name, ... })`.

`initialize(scannedModules)`:

1. `setWindowProvider` wired to DI  
2. Iterate each module's `declarations`  
3. If `autoCreate !== false`, call `createWindow(config)`

`createWindow`:

- `new BrowserWindow(config.options)`
- Development: prefer `ELECTRON_RENDERER_URL` or `config.devUrl` → `loadURL`  
- Production: `config.prodFile` → `loadFile`  
- `show` after `ready-to-show`  
- On `closed`, remove from Map to avoid holding destroyed windows

### API

| Method | Purpose |
|------|------|
| `getWindow(name)` | Get one window; default name=`main` |
| `getAllWindows()` | All live windows |
| `sendTo(name, channel, ...args)` | Targeted `webContents.send` |
| `broadcast(channel, ...args)` | Send to all non-destroyed windows |

Cross-window communication does not go through IpcBridge Controller metadata—it is a direct WindowManager capability.

### With @WindowRef

Application side:

```ts
@WindowRef('main')
mainWin!: BrowserWindow
```

DI resolves to `electrum:window:main` → `getWindow('main')`.  
Missing or not-yet-created windows throw at resolve time—hence startup order "windows before IPC".

## 2. EventBridge

Scans each module's **controllers + providers**:

```
handlers = META.APP_EVENT[]   // { event, method }
instance = resolve(class)
app.on(event, (...args) => instance[method](...args))
```

- Sync exceptions and Promise rejections are only logged—main process keeps running.  
- Arguments forwarded as-is from Electron `app` event callbacks (e.g. `window-all-closed`).

Difference from IpcBridge: event source is **Electron `app`**, not renderer IPC.

## 3. LifecycleManager

Three hook names match interface methods:

| Hook | Typical use |
|------|----------|
| `onModuleInit` | Read config, open connections (runs right after IPC registration in `start`) |
| `onAppReady` | Startup logic that needs windows + IPC ready |
| `onModuleDestroy` | Tear down resources; `before-quit` → `shutdown` |

Execution rules:

1. Collect Controllers/Providers that exist in the container **and** have the method on the instance  
2. Call in parallel via `Promise.allSettled`  
3. Individual failures are logged; other instances are not blocked  

Nest analogy: `OnModuleInit` / `onApplicationBootstrap`, etc.—here simplified to three hooks for Electron.

## 4. Relation to Application.shutdown

```
before-quit
  → plugin.destroy?
  → onModuleDestroy
  → ipcBridge.unregisterAll()
```

After reading, open these examples:

- `examples/basic/src/main/window/window.module.ts`
- `examples/basic/src/main/app.controller.ts` (if it has `@AppEvent`)
- `examples/basic/src/main/file/file.service.ts` (lifecycle cleanup)

Next: [Type generation & plugins](./types-and-plugins.md)
