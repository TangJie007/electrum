# @electrum/example-basic

Demonstrates `@electrum/common` + `@electrum/core` + `@electrum/preload` + `@electrum/client` with:

- Module / Controller / IPC handlers
- Field injection and lifecycle hooks
- Declarative windows
- Global filters / interceptors
- Preload: `exposeApi()` from `@electrum/preload`
- Renderer: Vue 3 + `createClient()` (`api.user.list()`)

## Dev

```bash
pnpm dev   # electron-vite dev --watch
```

- **Renderer**（`src/renderer`）：Vite HMR，改 Vue 即时更新。
- **Main / Preload**（含 `user.service.ts`）：`electron-vite dev --watch` 重建并**重启** Electron 进程（框架不做进程内软重载）。
