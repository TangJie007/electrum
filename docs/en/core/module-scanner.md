# ModuleScanner Design

Source: `packages/core/src/module/scanner.ts`  
Related: `@Module` (`packages/common/src/decorators/module.decorator.ts`), `DIContainer`, `Application.start()`

## 1. What Problem It Solves

Applications declare structure with `@Module({ imports, controllers, providers, declarations })`.  
`ModuleScanner` at runtime:

1. Reads `META.MODULE` metadata  
2. Expands the `imports` module tree  
3. **Registers** Providers / Controllers into the same `DIContainer`  
4. Produces `ScannedModule[]` for IPC, windows, and lifecycle to consume  

It does **not**: instantiate business objects (that's `container.resolve`) or bind `ipcMain`.

## 2. Position in the Startup Chain

```
createApp(AppModule).start()
  │
  ├─ ModuleScanner.scan(AppModule)   ← this module
  │     · register all providers / controllers
  │     · return scannedModules
  ├─ app.whenReady()
  ├─ WindowManager.initialize(scannedModules)   // uses declarations
  ├─ IpcBridge.registerAll(scannedModules)      // uses controllers
  └─ LifecycleManager(... scannedModules)
```

## 3. Algorithm: DFS + visited

```
walk(M):
  if M in visited: return
  add M to visited
  meta = readMetadata(M, META.MODULE)   // no @Module → throw
  for child in meta.imports:
    walk(child)                         // children first
  register each meta.providers
  register each meta.controllers
  results.push(ScannedModule)
```

| Design choice | Reason |
|--------|------|
| **imports before self** | Dependent module Providers enter the container first so this module can resolve them |
| **visited** | Avoid infinite loops from circular imports |
| **results order** | Child modules first: matches DFS completion order, easier to reason about dependencies |

Example (basic):

```
AppModule
  imports: [WindowModule, FileModule]
  → walk(WindowModule) first, then walk(FileModule)
  → then register AppModule's own controllers/providers
```

## 4. Four Provider Shapes

Aligned with Nest, handled by `registerProvider`:

| Form | Registration |
|------|----------|
| `FileService` (class) | `token=FileService`, `useClass`, scope from `@Injectable` |
| `{ provide, useValue }` | Constants / config objects |
| `{ provide, useClass }` | Token separate from implementation class |
| `{ provide, useFactory, inject? }` | Factory; resolve `inject` list first at resolve time |

Only "class / useClass" entries appear in `ScannedModule.providers` (for lifecycle iteration over class instances).  
`useValue` / `useFactory` register in the container only—they may not appear in the `providers` array.

## 5. Why Controllers Are Also Registered

`IpcBridge` does:

```ts
const instance = this.container.resolve(controllerClass)
```

Controllers often have `@Inject` / `@WindowRef`.  
So the Scanner registers Controllers with `useClass: controller`, using the same property injection path as Providers.

## 6. ScannedModule Field Consumers

| Field | Downstream consumer |
|------|------------|
| `controllers` | `IpcBridge`, `LifecycleManager`, `EventBridge` |
| `providers` | `LifecycleManager`, `EventBridge` (class instance hooks / AppEvent) |
| `declarations` | `WindowManager` (`@WindowDeclaration`) |
| `metadata` | Retains original `@Module` config |

## 7. Known Limitations (Specs / Future Evolution)

- **Global DI**: All module Providers register into **one** container; after registration they are injectable globally (no module-level visibility boundary).  
- **Circular module imports**: `visited` skips re-walking; circular instance dependencies are still detected by `DIContainer`.

## 8. Cross-Reading

1. Inline comments in `scanner.ts`  
2. Metadata writes: `@Module` in common  
3. After registration, how resolution works: `di/container.ts`, [Module scan & DI](./di-and-modules.md)  
4. Example tree: `examples/basic/src/main/app.module.ts`
