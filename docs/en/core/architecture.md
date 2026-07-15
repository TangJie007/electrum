# Core Architecture Overview

## 1. Source Map

```
packages/core/src/
├── index.ts                 # Public exports + re-export common
├── application.ts           # Orchestration entry: createApp / start
├── di/container.ts          # Dependency injection container (property injection)
├── module/scanner.ts        # Recursively scan @Module tree, register Providers
├── bridge/
│   ├── ipc-bridge.ts        # Controller → ipcMain.handle / on
│   └── event-bridge.ts      # @AppEvent → app.on
├── middleware/pipeline.ts   # Guard → Pipe → Interceptor → Filter
├── window/manager.ts        # Declarative windows + @WindowRef lookup
├── lifecycle/manager.ts     # onModuleInit / onAppReady / onModuleDestroy
├── type-generator/          # Scan channels, generate renderer-side api.d.ts skeleton
└── plugin/                  # Plugin interface (install / ready / destroy)
```

## 2. Layering

```
┌─────────────────────────────────────────────────────────┐
│  Your app: AppModule / Controller / Service (via common)   │
└────────────────────────────┬────────────────────────────┘
                             │ createApp(AppModule).start()
┌────────────────────────────▼────────────────────────────┐
│  Application (orchestrator)                                │
│  Holds: DIContainer / Pipeline / WindowManager / Bridges   │
└─┬──────────┬──────────┬──────────┬──────────┬───────────┘
  │          │          │          │          │
  ▼          ▼          ▼          ▼          ▼
 Scanner   Container  IpcBridge  WindowMgr  Lifecycle
 read tree resolve    bind IPC   create win call hooks
 register  inject     via Pipeline
 DI
```

Metadata always comes from **`Symbol.metadata` on classes** (written by common decorators); core only reads it—never writes business decorators.

## 3. `start()` Sequence (Must Know)

Corresponds to `start()` in `application.ts`:

```
createApp(RootModule)
  │
  ├─ 1. ModuleScanner.scan(root)
  │      · depth-first walk imports
  │      · register providers / controllers in DIContainer
  │
  ├─ 2. await electronApp.whenReady()
  │
  ├─ 3. WindowManager.initialize()     ← must run before resolving Controllers
  │      · create declarative windows
  │      · setWindowProvider → for @WindowRef
  │
  ├─ 4. IpcBridge.registerAll()
  │      · resolve each Controller
  │      · bind ipcMain by prefix + channel
  │
  ├─ 5. EventBridge.registerAll()
  │      · @AppEvent on controllers + providers
  │
  ├─ 6. Lifecycle: onModuleInit → onAppReady
  │
  ├─ 7. plugin.ready?.()
  │
  └─ 8. before-quit → shutdown → onModuleDestroy + unregister IPC
```

**Why windows before IPC?**  
Controllers may use `@WindowRef`. If you `resolve(Controller)` before creating windows, injection fails. So `WindowManager.initialize` runs before `IpcBridge.registerAll`.

## 4. Application Public API

| Method | Purpose |
|------|------|
| `createApp(root)` | Factory; app not started yet |
| `start()` | Run the full orchestration above |
| `use(plugin)` | Call `install` immediately; `ready` at end of `start` |
| `useGlobalGuards/Pipes/Interceptors/Filters` | Append to Pipeline global lists |
| `resolve(token)` | Pass through to DI |
| `getWindowManager()` / `getContainer()` | Access internal components |
| `generateTypes(path)` | Scan channels and write `.d.ts` |

## 5. Correspondence with NestJS

| NestJS | Electrum core |
|--------|----------------|
| `NestFactory.create` | `createApp` |
| `ModulesContainer` / scanning | `ModuleScanner` |
| `Injector` | `DIContainer` (**property injection**, no ctor `design:paramtypes`) |
| HTTP Adapter | `IpcBridge` (binds `ipcMain`) |
| Middleware / pipe chain | `MiddlewarePipeline` |
| Application lifecycle hooks | `LifecycleManager` |

Key difference: transport is **IPC channels**, not HTTP; injection uses **field decorators + Symbol.metadata**, not `reflect-metadata`.

## 6. How to Trace a Request While Learning

Using `file:read` as an example (see `examples/basic`):

1. At startup, `ModuleScanner` registers `FileController` / `FileService`
2. `IpcBridge` reads `@Controller('file')` + `@IpcHandle('read')` → channel `file:read`
3. Renderer calls `invoke('file:read', path)`
4. `ipcMain.handle` → `MiddlewarePipeline.execute`
5. Guard → Pipe(args[0]) → Interceptor onion → `FileController.read(...)`
6. Service is injected into Controller fields via `@Inject` during resolve
7. Exceptions are shaped by Filter into `{ __error: true, code, message }`

Next: [Module scan & DI](./di-and-modules.md)
