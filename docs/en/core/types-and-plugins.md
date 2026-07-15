# Type Generation & Plugins

Corresponding source:

- `packages/core/src/type-generator/generator.ts`
- `packages/core/src/plugin/plugin.interface.ts`
- `packages/core/src/application.ts` (`generateTypes` / `use`)

## 1. TypeGenerator (Current Capabilities)

### What It Does

Scans all `@IpcHandle` channels and writes a renderer-side declaration skeleton, for example:

```ts
export interface IpcApi {
  'file:read': (...args: any[]) => Promise<any>
  // ...
}

export interface ElectronAPI {
  invoke: <K extends keyof IpcApi>(channel: K, ...args: Parameters<IpcApi[K]>) => ReturnType<IpcApi[K]>
  on: ...
  send: ...
}

declare global {
  interface Window { api: ElectronAPI }
}
```

Usage:

```ts
createApp(AppModule).generateTypes('src/renderer/types/api.d.ts')
```

Or before `start`, as long as the root module can be scanned.

### Limitations (Don't Misread While Learning)

Current implementation does **not** yet use ts-morph to extract real parameter/return types; everything is `any`.  
Roadmap v0.4 is "precise types + auto-generated preload scripts". **Hand-written preload** already works with `@electrum/preload`'s `exposeApi()`; renderer calls use `@electrum/client`. Today's type generator is for:

- Ensuring channel names exist as type keys  
- Providing a base literal union for `Window.api.invoke` channels

When reading code, focus on how `META.CONTROLLER` + `META.IPC_HANDLE` build `prefix:channel`—same rules as IpcBridge.

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
