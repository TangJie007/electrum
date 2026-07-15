# Client (@electrum/client)

`window.api.invoke('user:list')` works, but channel strings scattered everywhere hurt readability. `@electrum/client` wraps the preload bridge with:

- **Nested calls**: `api.user.list()` → `invoke('user:list')`
- **Still flat**: `api.invoke('user:list')`
- **Typed parameters**: pass your `IpcApi` channel map for argument / return hints

## Installation

```bash
pnpm add @electrum/client
```

No Electron dependency—runs in the renderer (or Vitest with DOM).

## Prerequisites

1. Preload has called `@electrum/preload`'s `exposeApi()` (default `window.api`)
2. (Recommended) Declare a channel type map, for example:

```ts
// ipc-api.ts
export interface IpcApi {
  'app:info': () => Promise<{ name: string; version: string }>
  'user:list': () => Promise<Array<{ id: number; name: string }>>
  'file:read': (path: string) => Promise<string>
}
```

You can generate a skeleton with `createApp(...).generateTypes(...)`, then fill in precise types by hand.

## Usage

```ts
import { createClient } from '@electrum/client'
import type { IpcApi } from './ipc-api'

const api = createClient<IpcApi>()

await api.app.info()
await api.user.list()
await api.file.read('/tmp/a.txt')

// Equivalent flat form
await api.invoke('user:list')

api.on('file:saved', (path) => {
  console.log('saved', path)
})

api.send('file:watch', '/tmp/a.txt')
```

Rule: Controller prefix + Handle name → `prefix:channel` → nested as `api.prefix.channel(...)`.

## Options

```ts
createClient({
  key: 'api', // must match exposeApi({ key }), default 'api'
})

// Inject a fake bridge in tests without mounting window
createClient({
  bridge: {
    invoke: async () => [],
    on: () => () => {},
    send: () => {},
  },
})
```

## Exports

| Export | Description |
|------|------|
| `createClient` | Create the client |
| `ElectrumClient` / `IpcApiMap` etc. | Types |

## Division of Labor with Preload

```
Renderer  createClient()  ──►  window.api  ◄──  exposeApi()  preload
              │                  │
              │                  └── ipcRenderer.invoke / on / send
              └── api.user.list() → invoke('user:list')
```

| Package | Runs in | Role |
|----|--------|--------|
| `@electrum/preload` | preload | `contextBridge` + error restoration |
| `@electrum/client` | renderer | Call sugar + types |

## Full Example

See [`examples/basic/src/renderer/App.vue`](https://github.com/TangJie007/electrum/tree/main/examples/basic/src/renderer/App.vue): `createClient<IpcApi>()` + `api.user.list()` / `api.file.read()`.

## Next Steps

→ [Controllers](./controllers) (how channels are declared on main process)  
→ [Example Projects](./examples)
