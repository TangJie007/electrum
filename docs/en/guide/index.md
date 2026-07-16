# Overview

Electrum is a progressive framework for the **Electron main process**: it organizes IPC, windows, and business logic using the familiar NestJS decorators, dependency injection, and modular structure.

Under the hood it is still Electron itself (`ipcMain`, `BrowserWindow`, `app` events). Electrum does not replace these APIs—it adds a clear application architecture on top so main-process code is testable, maintainable, and can be adopted incrementally.

## Design Philosophy

The main process of a desktop app often becomes "one giant `main.ts`": IPC listeners, window creation, and business logic tangled together. Electron is fully capable, but few tools solve the **architecture** problem for you.

Electrum provides an out-of-the-box application structure inspired by NestJS / Angular:

| Concept | Role in Electrum |
|------|----------------------|
| **Controller** | Handles IPC calls from the renderer process |
| **Provider / Service** | Injectable business logic and utilities |
| **Module** | Groups Controllers, Providers, and window declarations |
| **Middleware pipeline** | [Guard](./guards) → [Pipe](./pipes) → [Interceptor](./interceptors) → [Filter](./filters) |

You can start with a single Controller—no need to rewrite the entire main process at once.

## Core Building Blocks

```
Renderer  ──invoke / send──►  Controller (@IpcHandle / @IpcOn)
                                    │
                                    ▼
                              Service (@Injectable)
                                    │
                                    ▼
                         Window / filesystem / other Electron APIs
```

- **Controllers** — IPC entry points for the app. Use `@Controller('file')` to declare a prefix and `@IpcHandle('read')` to bind the `file:read` channel. See [Controllers](./controllers).
- **Providers** — Services marked with `@Injectable()`; injected into Controllers or other services via `@Inject`. See [Providers](./providers).
- **Modules** — `@Module({ controllers, providers, imports, declarations })` describes a functional boundary. See [Modules](./modules).
- **Preload / Client** — Secure renderer bridge and call wrappers. See [Preload](./preload), [Client](./client).

## Package Responsibilities

```
@electrum/common   = declarations (decorators write metadata)
@electrum/core     = runtime (read metadata → build container → wire Electron)
@electrum/preload  = preload bridge (contextBridge + error restoration)
@electrum/client   = renderer-side calls (api.user.list())
```

Main process: write declarations with `@electrum/common`, bootstrap with `createApp` from `@electrum/core`.  
Renderer chain: `exposeApi()` in preload, `createClient()` in the renderer. Decorators do not run business logic—they only write `Symbol.metadata`; wiring happens at `createApp(AppModule).start()`.

Electrum uses **TypeScript 5 Stage 3 native decorators**—no `experimentalDecorators` or `reflect-metadata`.

## Compared to Raw Electron

| Raw Electron | Electrum |
|------|----------|
| Hand-written `ipcMain.handle` in `main.ts` | `@Controller` + `@IpcHandle` auto-registration |
| `new Service()` scattered everywhere | DI container wires everything |
| Window creation spread across the codebase | `@WindowDeclaration` + module `declarations` |
| Per-call `try/catch` error handling | Filter pipeline normalizes to `IpcErrorResponse` |

## Next Steps

→ [Quick start](./getting-started)  
→ [Architecture](./architecture) (package layers, bootstrap, end-to-end IPC)
