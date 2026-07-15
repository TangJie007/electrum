# Specs ↔ `@electrum/core` Mapping

This document maps which `specs/` feature slices are implemented by **`packages/core`**, to align requirements with source learning.

> Most Specs are still skeletons (`draft`); **not all have passed wetspec acceptance**. "Completion" below is a subjective assessment of the repo today—not the same as `wetspec verify` passing.

## Overview

```
specs/ feature slices
    │
    ├── @electrum/common   ← decorators / metadata / exceptions / Logger (declaration layer)
    ├── @electrum/core     ← scan / DI / IPC / pipeline / windows / events / lifecycle (runtime)
    ├── @electrum/preload  ← contextBridge, invoke error restoration
    ├── @electrum/client   ← renderer createClient / nested calls
    ├── @electrum/testing  ← test container
    └── tooling / examples ← package layout, electron-vite, etc.
```

**Core in one line**: Read metadata written by common, assemble the container, and bind to Electron.

---

## I. Spec Slices Implemented by Core

| Spec module | Feature spec | Source location | Completion | Notes |
|-----------|-----------|----------|--------|------|
| App bootstrap & API | createApp startup orchestration | `application.ts` | ✅ Mostly done | `start()` chains scan→windows→IPC→hooks |
| App bootstrap & API | Application runtime API | `application.ts` | ✅ Mostly done | `use` / `useGlobal*` / `resolve` / `generateTypes`, etc. |
| DI container | Property injection resolution | `di/container.ts` | ✅ Mostly done | `new` + read `META.INJECTIONS` |
| DI container | Scope & circular dependency detection | `di/container.ts` | ✅ Mostly done | singleton / transient + resolving chain |
| Module system | ModuleScanner module tree scan | `module/scanner.ts` | ✅ Mostly done | DFS imports, register Providers |
| Module system | ModuleScanner module tree scan | `module/scanner.ts` | ✅ Code present | Providers share one global container |
| IPC bridge | Controller auto-bind ipcMain | `bridge/ipc-bridge.ts` | ✅ Mostly done | `prefix:channel` → handle/on |
| IPC bridge | IPC argument position convention | `ipc-bridge` + `pipeline` | ✅ Mostly done | Handle: no event; On: has event |
| Middleware chain | Guard Pipe Interceptor Filter pipeline | `middleware/pipeline.ts` | ✅ Code present | Formal Spec AC acceptance still pending |
| Middleware chain | Middleware decorators & global registration | pipeline + `useGlobal*` | ✅ Code present | Decorator bodies in common |
| Window management | Declarative window creation & DI integration | `window/manager.ts` | ✅ Mostly done | Create windows before resolving `@WindowRef` |
| Window management | Cross-window communication | `window/manager.ts` | ✅ Mostly done | `sendTo` / `broadcast` |
| Event system | EventBridge binds AppEvent | `bridge/event-bridge.ts` | ✅ Mostly done | `app.on` → instance method |
| Lifecycle | Three hooks & parallel execution | `lifecycle/manager.ts` | ✅ Mostly done | Parallel via `allSettled` |
| Lifecycle | Startup / shutdown ordering | `application.ts` | ✅ Mostly done | ready / before-quit |
| Type generation | Renderer api.d.ts generation | `type-generator/generator.ts` | ⚠️ Skeleton | Channels present; types mostly `any` |
| Type generation | ts-morph precise types & Preload generation | — | ❌ Not done | Roadmap v0.4 |
| Plugin system | Plugin interface & install lifecycle | `plugin/` + `use()` | ⚠️ Interface only | `install` / `ready` / `destroy` |
| Plugin system | Official plugin package naming reserved | — | ❌ Reserved only | `@electrum/plugin-*` |
| HMR & dev experience | electron-vite integration preset | Example config | ⚠️ Not a framework package | `examples/basic`: `electron-vite dev --watch` full process restart |

### Core Source ↔ Spec Quick Reference

```
application.ts          → App bootstrap & API, lifecycle ordering, plugin orchestration
di/container.ts         → DI container
module/scanner.ts       → Module system
bridge/ipc-bridge.ts    → IPC bridge
middleware/pipeline.ts  → Middleware chain (runtime execution)
window/manager.ts       → Window management
bridge/event-bridge.ts  → Event system
lifecycle/manager.ts    → Lifecycle hook execution
type-generator/         → Type generation (skeleton only today)
plugin/                 → Plugin system interface
```

---

## II. Not in Core (Declaration Layer / Other Packages)

| Spec module | Primary owner | Notes |
|-----------|----------|------|
| TS5 decorator metadata mechanism | `@electrum/common` | polyfill, META, readMetadata |
| Decorator system | `@electrum/common` | `@Module` / `@IpcHandle` / `@Inject`, etc. |
| Error handling | `@electrum/common` + `@electrum/preload` | Exception classes in common; renderer restore via `exposeApi()` |
| Logging | `@electrum/common` | `Logger` |
| Package layout & tooling | monorepo root | workspace / tsup / tsconfig |
| Testing utilities | `@electrum/testing` | `createTestContainer` |
| Renderer Preload bridge | `@electrum/preload` | `exposeApi` / `IpcError` |
| Renderer IPC client | `@electrum/client` | `createClient` (`api.user.list()`) |

Core **depends on and reads** common metadata; it does not "implement" decorators themselves.

---

## III. Learning Suggestions (Aligned with Specs)

If reading core by Spec slice, prioritize these six (most complete code today):

1. App bootstrap & API  
2. DI container  
3. Module system (scanning)  
4. IPC bridge  
5. Middleware chain  
6. Window + event + lifecycle  

Then: precise type generation, official plugins.

Related docs:

- [Core learning guide](/en/core/)
- [Architecture overview](./architecture.md)
