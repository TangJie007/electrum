# @electrum/example-basic

Demonstrates `@electrum/common` + `@electrum/core` + `@electrum/preload` + `@electrum/client` with an Element Plus admin shell:

- Module / Controller / IPC handlers
- Field injection and lifecycle hooks
- Frameless window + custom title bar controls (minimize / maximize / close)
- Custom in-app menus + native `Menu` accelerators
- Multi-window (`window:openChild`)
- Guard / Pipe / global filters / interceptors
- Plugin lifecycle (`install` / `ready` / `destroy`)
- Preload: codegen-generated `exposeApi()` + channel allowlist
- Renderer: Vue 3 + Element Plus + `createClient()`
- IPC types: `@electrum/codegen` runs on `predev` / `prebuild`

## Dev

```bash
pnpm dev       # codegen → electron-vite dev --watch
pnpm codegen   # regenerate ipc-api.ts + preload/index.ts
```

From repo root:

```bash
pnpm build
pnpm dev:example
```

- **Renderer**（`src/renderer`）：Vite HMR，改 Vue 即时更新。
- **Main / Preload**：`electron-vite dev --watch` 重建并**重启** Electron 进程。

## Layout

| 路径 | 内容 |
|------|------|
| `src/main/window/` | 无边框主窗、窗口控制、多窗口、原生菜单 |
| `src/main/user/`、`file/` | 业务 Controller（含 Guard / Pipe / IpcOn） |
| `src/preload/index.ts` | codegen 生成（`exposeApi` + `IPC_INVOKE_CHANNELS`） |
| `src/renderer/` | Element Plus 管理端（标题栏 / 侧栏 / 各页面） |
| `src/renderer/ipc-api.ts` | codegen 生成的 `IpcApi` |
| `src/renderer/app-types.ts` | 手写 UI 类型（`NavView` / `UserRow`） |
