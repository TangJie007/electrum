# @electrum/core Learning Guide

This section documents the **runtime engine** `@electrum/core`—how Electrum turns decorator metadata into a running Electron main-process application.

> Decorators, interfaces, and exceptions live in `@electrum/common` (`packages/common`).  
> Core **depends on** common and handles "scan → assemble → bind IPC → lifecycle".

To build applications, start with the [User Guide](/en/guide/); this section is a source-code walkthrough.

## Suggested Reading Order

| Order | Document | Source code |
|------|------|----------|
| 1 | [Architecture overview](./architecture) | `application.ts`, `index.ts` |
| 2 | [ModuleScanner design](./module-scanner) | `module/scanner.ts` |
| 3 | [Module scan & DI](./di-and-modules) | `module/scanner.ts`, `di/container.ts` |
| 4 | [IPC bridge & middleware](./ipc-and-middleware) | `bridge/ipc-bridge.ts`, `middleware/pipeline.ts` |
| 5 | [Window / event / lifecycle](./window-event-lifecycle) | `window/`, `bridge/event-bridge.ts`, `lifecycle/` |
| 6 | [Type generation & plugins](./types-and-plugins) | `type-generator/`, `plugin/` |
| 7 | [Specs ↔ Core mapping](./specs-mapping) | `specs/` and implementation coverage |

Read alongside the example: `examples/basic/src/main/`.

## One-Line Positioning

```
@electrum/common   = declarations (decorators write metadata)
@electrum/core     = execution (read metadata → build container → bind Electron)
@electrum/preload  = preload bridge (see [User Guide · Preload](/en/guide/preload))
@electrum/client   = renderer client (see [User Guide · Client](/en/guide/client))
```

Typical application-side usage:

```ts
import { Module, Controller, IpcHandle, Injectable, Inject } from '@electrum/common'
import { createApp } from '@electrum/core'

await createApp(AppModule).start()
```

`@electrum/core` also **re-exports** common's public API (see `packages/core/src/index.ts`), so you can import everything from core; when learning, keep "declarations" and "runtime" mentally separate.
