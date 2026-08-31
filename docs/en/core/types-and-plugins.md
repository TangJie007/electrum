# Type Generation & Plugins

Corresponding source:

- `@electrum/codegen` (`packages/codegen`) — precise IPC type generation via ts-morph
- `packages/core/src/plugin/plugin.interface.ts`
- `packages/core/src/application.ts` (`use`)

## 1. Type Generation (`@electrum/codegen`)

Runtime `Application` no longer embeds a type generator. Use the **`electrum-codegen` CLI** (or the `generateIpcTypes` API) to scan `@Controller` / `@IpcHandle` sources and emit a typed `IpcApi` declaration.

```bash
# from an app with controllers on the TypeScript project
pnpm exec electrum-codegen \
  --tsconfig tsconfig.json \
  --output src/renderer/ipc-api.ts \
  --global
```

```ts
import { generateIpcTypes } from '@electrum/codegen'

await generateIpcTypes({
  tsconfig: 'tsconfig.json',
  outputPath: 'src/renderer/ipc-api.ts',
  includeGlobal: true,
})
```

Generated shapes look like:

```ts
export interface IpcApi {
  'file:read': (path: string) => Promise<string>
  // ...
}
```

Optionally also emit a preload entry:

```bash
pnpm exec electrum-codegen \
  --tsconfig tsconfig.json \
  --output src/renderer/ipc-api.ts \
  --preload src/preload/index.ts
```

```ts
// preload output
import { exposeApi } from '@electrum/preload'
export const IPC_INVOKE_CHANNELS = ['file:read', ...] as const
exposeApi()
```

See `examples/basic` (`pnpm codegen`) for a full wiring example. Renderer calls use `@electrum/client`.

## 2. Plugin Interface

```ts
interface Plugin {
  name: string
  install(app: Application): void           // immediately on use()
  ready?(app: Application): void | Promise  // after successful start, after lifecycle hooks
  destroy?(app: Application): void | Promise // before-quit
}
```

Usage:

```ts
app.use({
  name: 'demo',
  install(app) { /* e.g. attach global Guard */ },
  async ready(app) { /* app can receive IPC */ },
  async destroy() { /* release external resources */ },
})
```

Plugins receive the full `Application`, so they can `resolve` / `getWindowManager` / `useGlobal*`.  
Official `@electrum/plugin-*` packages are a later phase; extend via this interface for now.

## 3. Learning Checklist

After core, you should answer without the docs:

1. In the nine `start()` steps, which step must complete before `@WindowRef` can succeed?  
2. What's the middleware path difference between `IpcHandle` and `IpcOn`?  
3. Why does DI `new()` first, then read `META.INJECTIONS`?  
4. Why must Filter return values include `__error`?  
5. How do main-process code changes take effect in dev? (`--watch` full process restart)

Self-test: set breakpoints in `examples/basic` and step through `createApp(...).start()`.

Back to: [Core learning guide home](/en/core/)
