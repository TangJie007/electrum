# Preload (@electrum/preload)

The renderer process cannot access Node / Electron main APIs directly. The secure approach is to expose a small bridge in **preload** via `contextBridge`, then use it from the renderer.

`@electrum/preload` wraps the bridge that pairs with the Electrum main process, so you do not hand-roll `invoke` / `__error` restoration in every project.

## Installation

```bash
pnpm add @electrum/preload
# peer: electron >= 20
```

## Usage

```ts
// src/preload/index.ts
import { exposeApi } from '@electrum/preload'

exposeApi()
```

By default this mounts on `window.api`:

| Method | Purpose |
|------|------|
| `invoke(channel, ...args)` | Request-response (maps to `@IpcHandle`); if main process returns `{ __error: true }`, throws `IpcError` |
| `on(channel, listener)` | Subscribe to main-process push; returns an unsubscribe function |
| `send(channel, ...args)` | One-way message (maps to `@IpcOn`) |

Custom mount key:

```ts
exposeApi({ key: 'electrum' }) // → window.electrum
```

## Error Convention

When main-process Filter / pipeline fails, Handle channels typically return:

```ts
{
  __error: true,
  code: string,
  message: string,
  details?: unknown
}
```

`exposeApi`'s `invoke` detects this shape and `throw new IpcError(code, message, details)`; handle it on the renderer with `try/catch`.

## With Window Declarations

Point `webPreferences.preload` at the compiled preload script, for example:

```ts
@WindowDeclaration({
  name: 'main',
  options: {
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  },
  // ...
})
export class MainWindow {}
```

## Exports

| Export | Description |
|------|------|
| `exposeApi` | Register the `window` bridge |
| `IpcError` | Renderer-side error class |
| `isIpcErrorPayload` | Check whether a payload is `__error` |

## Related

- More ergonomic renderer calls: [Client](./client)
- IPC controllers: [Controllers](./controllers)
- Full example: `examples/basic/src/preload/index.ts`

## Next Steps

→ [Client](./client)
