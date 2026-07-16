# Architecture

This page describes the **whole monorepo**: package roles and runtime orchestration. For hands-on usage see [Quick start](./getting-started). Source walkthroughs live in `docs/en/core/` (excluded from the published site).

## 1. Positioning

Electrum is a NestJS-style MVC framework for the **Electron main process**:

- **Declare** in `@electrum/common` (decorators write `Symbol.metadata`)
- **Execute** in `@electrum/core` (scan → DI → bind windows / IPC / events)
- **Renderer** talks through `@electrum/preload` + `@electrum/client`

It does not replace Electron APIs; it organizes them so main-process code is modular, injectable, and testable.

## 2. Package map

| Package | Role | Typical entry |
|---------|------|---------------|
| `@electrum/common` | Decorators, metadata keys, middleware interfaces, exceptions, Logger | `Module`, `Controller`, `IpcHandle`, `Inject` |
| `@electrum/core` | Runtime orchestration | `createApp`, `Application.start` |
| `@electrum/preload` | Safe preload bridge | `exposeApi()` → `window.api` |
| `@electrum/client` | Typed renderer calls | `createClient<IpcApi>()` |
| `@electrum/testing` | DI helpers for tests | `createTestContainer` |
| `examples/basic` | Full Electron + Vue sample | `createApp(AppModule).start()` |
| `examples/di` | Mini DI tutorial (no Electron) | Manual `register` / `resolve` |

Dependency direction (acyclic):

```
App code
  ├─ common (declare)
  ├─ core (bootstrap; depends on common)
  └─ renderer
       ├─ preload (Electron + error contract)
       └─ client (window.api)
```

`@electrum/common` has **zero runtime dependencies**; core is what calls `ipcMain` / `BrowserWindow` / `app`.

## 3. Bootstrap sequence

Entry: `createApp(RootModule)` → `await app.start()`.

```
createApp(AppModule)
  │
  ├─ 1. ModuleScanner.scan(root)
  │      · DFS @Module.imports
  │      · Register providers / controllers into DIContainer
  │      · Collect @WindowDeclaration
  │
  ├─ 2. await electronApp.whenReady()
  │
  ├─ 3. WindowManager.initialize()
  │      · Create BrowserWindows from declarations
  │      · setWindowProvider → @WindowRef
  │      · setWindowSender   → @IpcEmit
  │
  ├─ 4. IpcBridge.registerAll()
  │      · resolve(Controller) (property injection ready)
  │      · @IpcHandle → ipcMain.handle (full middleware)
  │      · @IpcOn     → ipcMain.on (guards only)
  │
  ├─ 5. EventBridge.registerAll()
  │      · @AppEvent → app.on(...)
  │
  ├─ 6. Lifecycle: onModuleInit → onAppReady
  │
  ├─ 7. plugin.ready?.()
  │
  └─ 8. before-quit → shutdown
         · plugin.destroy → onModuleDestroy → unregisterAll IPC
```

**Hard rule: windows before IPC.**  
IPC registration `resolve`s Controllers that may need `@WindowRef` / `@IpcEmit`; windows must already exist.

## 4. Runtime components

| Component | Source | Role |
|-----------|--------|------|
| `Application` | `packages/core/src/application.ts` | Orchestrator; owns DI / pipeline / windows / bridges |
| `ModuleScanner` | `module/scanner.ts` | Walk module tree; register providers / controllers |
| `DIContainer` | `di/container.ts` | `register` / `resolve`; property injection; default singleton |
| `IpcBridge` | `bridge/ipc-bridge.ts` | Metadata → `ipcMain.handle` / `on` |
| `EventBridge` | `bridge/event-bridge.ts` | `@AppEvent` → `app.on` |
| `MiddlewarePipeline` | `middleware/pipeline.ts` | Guard → Pipe → Interceptor → Filter |
| `WindowManager` | `window/manager.ts` | Declarative windows, lookup, push send |
| `LifecycleManager` | `lifecycle/manager.ts` | `onModuleInit` / `onAppReady` / `onModuleDestroy` |
| `TypeGenerator` | `type-generator/` | Scan channels; emit renderer `IpcApi` skeleton |

## 5. Decorators vs runtime

Decorators **only write metadata**; wiring happens in `start()`.

| Concept | Decorator / API | Consumed by |
|---------|-----------------|-------------|
| Module | `@Module` | `ModuleScanner` |
| Injectable | `@Injectable` | `DIContainer` |
| IPC controller | `@Controller` | Builds `prefix:channel` |
| Request/response IPC | `@IpcHandle` | `IpcBridge` → `ipcMain.handle` |
| One-way receive | `@IpcOn` | `IpcBridge` → `ipcMain.on` |
| Main → renderer push | `@IpcEmit` | Injected send fn on resolve |
| App event | `@AppEvent` | `EventBridge` |
| DI | `@Inject` / `@Optional` | Field assignment in `resolve` |
| Window inject | `@WindowRef` | `WindowManager.getWindow` |
| Window declare | `@WindowDeclaration` | `WindowManager.createWindow` |
| Middleware | `@UseGuards/Pipes/Interceptors/Filters` | `MiddlewarePipeline` |

Channel naming: `@Controller('app')` + `@IpcHandle('info')` → **`app:info`**.

## 6. End-to-end IPC

Example `app:info` from `examples/basic`:

```
Renderer: api.app.info()
  → createClient Proxy → window.api.invoke('app:info')
  → preload: ipcRenderer.invoke('app:info')
  → main: ipcMain.handle('app:info')
  → MiddlewarePipeline.execute
       Guard → Pipe → Interceptor → AppController.getInfo()
  → return value via invoke Promise
  → if Filter yields { __error }, preload throws IpcError
```

Push (main → renderer):

```
@Controller('file') + @IpcEmit('saved') notifySaved
  → on resolve, inject (...args) => windowSender(target, 'file:saved', ...args)
  → WindowManager.sendTo / broadcast → webContents.send
  → renderer: api.on('file:saved', handler)
```

## 7. DI model

- **Property injection** (Stage 3 has no constructor-param injection): `@Inject(Token) field!: Type`
- `register` only stores recipes; `resolve` does `new` + field fill
- Default **singleton** (same container, same token → same instance)
- Supports `useClass` / `useValue` / `useFactory`, and `scope: 'transient'`

See `examples/di` for a walkthrough; production registration is via `ModuleScanner`.

## 8. Middleware pipeline

For `@IpcHandle`:

```
Guard (global → class → method)
  → Pipe (transform args[0])
    → Interceptor (onion)
      → Controller method
        → on throw: Filter (method → class → global)
```

For `@IpcOn`: **guards only**, then call the method; no return value.

Globals: `app.useGlobalGuards/Pipes/Interceptors/Filters(...)`.

## 9. Windows & lifecycle

| Capability | How |
|------------|-----|
| Declare window | `@WindowDeclaration(...)` + module `declarations` |
| Inject window | `@WindowRef('main')` |
| Module ready | implement `onModuleInit()` |
| App ready | implement `onAppReady()` (IPC / windows already bound) |
| Teardown | implement `onModuleDestroy()`; framework `unregisterAll`s IPC |

## 10. Design constraints

1. Decorators only write metadata; they do not run business logic.
2. Property injection only — no constructor injection.
3. `WindowManager.initialize` before `IpcBridge.registerAll`.
4. Metadata keys use `Symbol.for('electrum:...')` so packages share identity.
5. Channel = `prefix ? prefix + ':' + channel : channel`.
6. Providers default to singleton.
