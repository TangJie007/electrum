# Example Projects

The repository includes two examples with different purposes.

## examples/basic — Full Usage

Path: [`examples/basic`](https://github.com/TangJie007/electrum/tree/main/examples/basic)

Demonstrates:

- Module / Controller / IPC handlers
- Field injection and lifecycle hooks
- Declarative windows
- Global Filter / Interceptor
- Preload: `@electrum/preload`'s `exposeApi()` (`src/preload/index.ts`)
- Renderer: Vue 3 + `@electrum/client`'s `createClient()` (`api.user.list()`, etc.)

Start:

```bash
# Repository root
pnpm build
pnpm dev:example
```

Main process entry roughly:

```ts
const app = createApp(AppModule)
app.useGlobalInterceptors(LoggingInterceptor)
app.useGlobalFilters(GlobalExceptionFilter)
await app.start()
```

Recommended reading alongside:

| Path | Content |
|------|------|
| `src/main/app.module.ts` | Root module imports |
| `src/main/user/`, `file/`, `window/` | Feature modules |
| `src/preload/index.ts` | `exposeApi()` |
| `src/renderer/App.vue`, `ipc-api.ts` | `createClient<IpcApi>()` |

Preload / Client topics: [Preload](./preload), [Client](./client).

## examples/di — DI Mechanics Breakdown

Path: [`examples/di`](https://github.com/TangJie007/electrum/tree/main/examples/di)

This is not a "how to build an app with the framework" example—it reimplements the DI main path with minimal code to explain decorator metadata and the container:

| File | Maps to |
|------|----------|
| `01-polyfill.ts` | `packages/common` polyfill |
| `02-metadata.ts` | metadata keys |
| `03-injectable.ts` | `@Injectable` |
| `04-inject.ts` | `@Inject` |
| `05-container.ts` | `packages/core` DI container |
| `06-smoke.ts` | Smoke test |
| `demo.ts` | Usage demo |

```bash
cd examples/di
pnpm demo
pnpm start
```

## Docs Site and Design Documents

- This site's guide focuses on writing application code
- Repository root design doc: [electron-mvc-framework-design.md](https://github.com/TangJie007/electrum/blob/main/electron-mvc-framework-design.md)
- Requirement specs: [specs/](https://github.com/TangJie007/electrum/tree/main/specs)

## Back to the Guide

→ [Overview](./)
