# IPC Communication (Supplement)

For day-to-day usage, start with [Controllers](./controllers): channel prefixes, `@IpcHandle` / `@IpcOn`, module registration, and return values are covered there.

This page only supplements startup ordering and the type-generation entry point.

## Startup Order

Inside `createApp(AppModule).start()`, **after window initialization**, `IpcBridge` resolves Controllers and binds `ipcMain`. On the business side, declare classes in the module's `controllers` only.

Why after window creation? Controllers may use `@WindowRef`; resolving before windows exist would fail injection. See [Architecture Overview](/en/core/architecture).

## Type Skeleton

```ts
createApp(AppModule).generateTypes('src/renderer/types/api.d.ts')
```

Implementation details: [Type Generation and Plugins](/en/core/types-and-plugins). Pipeline behavior: [Middleware Pipeline](./middleware) ([Guard](./guards) / [Pipe](./pipes) / [Interceptor](./interceptors) / [Filter](./filters)) and [IPC and Middleware](/en/core/ipc-and-middleware).

## Renderer-Side Calls

- Preload bridge: [`@electrum/preload`](./preload) → `exposeApi()`
- Nested client: [`@electrum/client`](./client) → `createClient()` / `api.user.list()`

## Next Steps

→ [Preload](./preload)  
→ [Client](./client)  
→ [Middleware](./middleware)
