# Core Concepts

This page supplements the overview with a few additional conventions. If you have not read them yet, start with [Overview](./) and [Controllers](./controllers).

## Decorator Mental Model

1. **Decorators do not run business logic**—they only write configuration into a class / member's `Symbol.metadata`.
2. **At startup**, `createApp(AppModule).start()` will: scan the module tree → register DI → create windows → bind IPC / events → invoke lifecycle hooks.
3. Electrum uses **TypeScript 5 Stage 3 native decorators**—no `experimentalDecorators` or `reflect-metadata`.

## Package Responsibilities

| Package | Responsibility | Typical Exports |
|----|------|----------|
| `@electrum/common` | Decorators, interfaces, exceptions, Logger | `Module`, `Injectable`, `Controller`, `IpcHandle`, `Inject` |
| `@electrum/core` | Runtime engine | `createApp`, DI, scanning, IPC / Event bridge, window management |
| `@electrum/preload` | Preload security bridge | `exposeApi`, `IpcError` |
| `@electrum/client` | Renderer-process IPC client | `createClient` |
| `@electrum/testing` | Test helpers | `createTestContainer` |

Day-to-day main process: write declarations from `@electrum/common`, bootstrap with `createApp` from `@electrum/core`.  
Renderer process: `@electrum/preload` + `@electrum/client`. See [Preload](./preload), [Client](./client).  
`@electrum/core` also re-exports common's public API; when learning, distinguish "declarations" from "runtime."

## Capability Overview (v0.1)

- `@Module` / `@Injectable` / `@Controller` / `@IpcHandle` / `@IpcOn` / `@AppEvent`
- Property injection: `@Inject` / `@WindowRef` / `@Optional`
- DI container, module scanning, IPC / Event bridging
- Declarative windows: `@WindowDeclaration`
- Middleware chain ([Guard](./guards) / [Pipe](./pipes) / [Interceptor](./interceptors) / [Filter](./filters); overview in [Middleware Pipeline](./middleware))
- Lifecycle hooks, logging, exception types
- IPC channel type skeleton generation (`generateTypes`)
- Renderer side: `@electrum/preload` / `@electrum/client` (see [Preload](./preload), [Client](./client))

## Incremental Adoption

You can start with a single Controller—no need to refactor all main-process code at once. The framework does not wrap Electron APIs themselves; it only provides an organizational layer.

## Next Steps

→ [Controllers](./controllers)
