# IPC Communication 
For day-to-day usage, start with [Controllers](./controllers): channel prefixes, `@IpcHandle` / `@IpcOn`, module registration, and return values are covered there.

This page only supplements startup ordering.

## Startup Order

Inside `createApp(AppModule).start()`, **after window initialization**, `IpcBridge` resolves Controllers and binds `ipcMain`. On the business side, declare classes in the module's `controllers` only.

Why after window creation? Controllers may use `@WindowRef`; resolving before windows exist would fail injection. The framework therefore always does **windows first, then IPC**.

## Type Generation

```bash
pnpm exec electrum-codegen --tsconfig tsconfig.json --output src/renderer/ipc-api.ts
```

See [Controllers](./controllers#type-generation-optional) and `@electrum/codegen`.

Pipeline behavior: [Middleware Pipeline](./middleware) ([Guard](./guards) / [Pipe](./pipes) / [Interceptor](./interceptors) / [Filter](./filters)).

## Renderer-Side Calls

- Preload bridge: [`@electrum/preload`](./preload) → `exposeApi()`
- Nested client: [`@electrum/client`](./client) → `createClient()` / `api.user.list()`

## Next Steps

→ [Preload](./preload)  
→ [Client](./client)  
→ [Middleware](./middleware)
