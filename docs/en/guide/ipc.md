# IPC Communication 
For day-to-day usage, start with [Controllers](./controllers): channel prefixes, `@IpcHandle` / `@IpcOn`, module registration, and return values are covered there.

This page only supplements startup ordering.

## Startup Order

Inside `createApp(AppModule).start()`, **after window initialization**, `IpcBridge` resolves Controllers and binds `ipcMain`. On the business side, declare classes in the module's `controllers` only.

Why after window creation? Controllers may use `@WindowRef`; resolving before windows exist would fail injection. The framework therefore always does **windows first, then IPC**.

<!-- Temporarily hidden: type skeleton (document after precise generateTypes inference lands)
## Type Skeleton

```ts
createApp(AppModule).generateTypes('src/renderer/types/api.d.ts')
```

Today this is mostly a channel → `any` skeleton; tighten types manually as needed.
-->

Pipeline behavior: [Middleware Pipeline](./middleware) ([Guard](./guards) / [Pipe](./pipes) / [Interceptor](./interceptors) / [Filter](./filters)).

## Renderer-Side Calls

- Preload bridge: [`@electrum/preload`](./preload) → `exposeApi()`
- Nested client: [`@electrum/client`](./client) → `createClient()` / `api.user.list()`

## Next Steps

→ [Preload](./preload)  
→ [Client](./client)  
→ [Middleware](./middleware)
