# 示例项目

仓库内自带两个示例，用途不同。

## examples/basic — 完整用法

路径：[`examples/basic`](https://github.com/TangJie007/electrum/tree/main/examples/basic)

演示：

- Module / Controller / IPC handlers
- 字段注入与生命周期钩子（`OnModuleInit` / `OnAppReady`）
- 声明式窗口（`@WindowDeclaration` + `@WindowRef`，含 `show: false` 的显式显示时机）
- Guard → Pipe → Interceptor → Filter 全链路（`src/main/user/user.middleware.ts` 里的 `AllowAllGuard` / `TrimStringsPipe`）
- 全局 Filter / Interceptor
- Preload：`@electrum/preload` 的 `exposeApi()`（`src/preload/index.ts`）
- 渲染进程：Vue 3 + `@electrum/client` 的 `createClient()`（`api.user.list()` 等）

启动：

```bash
# 仓库根目录
pnpm build
pnpm dev:example
```

主进程入口大致为：

```ts
const app = createApp(AppModule)
app.useGlobalInterceptors(LoggingInterceptor)
app.useGlobalFilters(GlobalExceptionFilter)
await app.start()
```

推荐对照阅读：

| 路径 | 内容 |
|------|------|
| `src/main/app.module.ts` | 根模块 imports |
| `src/main/user/`、`file/`、`window/` | 功能模块 |
| `src/main/user/user.middleware.ts` | `@UseGuards` / `@UsePipes` 示例（Pipe 逐个参数执行） |
| `src/main/filters/global-exception.filter.ts` | 全局 Filter（未写 `@Catch` 即 catch-all） |
| `src/preload/index.ts` | `exposeApi()` |
| `src/renderer/App.vue`、`ipc-api.ts` | `createClient<IpcApi>()` |

Preload / Client 专题：[Preload](./preload)、[Client](./client)。

## examples/di — DI 机制拆解

路径：[`examples/di`](https://github.com/TangJie007/electrum/tree/main/examples/di)

这不是「如何用框架搭应用」的示例，而是用最少代码重写 DI 主路径，帮助理解装饰器元数据与容器：

| 文件 | 对应实现 |
|------|----------|
| `01-polyfill.ts` | `packages/common` polyfill |
| `02-metadata.ts` | metadata keys |
| `03-injectable.ts` | `@Injectable` |
| `04-inject.ts` | `@Inject` |
| `05-container.ts` | `packages/core` DI 容器 |
| `06-smoke.ts` | 冒烟测试 |
| `demo.ts` | 用法演示 |

```bash
cd examples/di
pnpm demo
pnpm start
```

## 文档站与设计文稿

- 本站「使用指南」偏怎么写业务代码
- 仓库根目录设计方案（v2.1 阶段的设计快照，实现已迭代，**代码行为以本指南为准**）：[electron-mvc-framework-design.md](https://github.com/TangJie007/electrum/blob/main/electron-mvc-framework-design.md)
- 需求 Spec：[specs/](https://github.com/TangJie007/electrum/tree/main/specs)

## 回到指南

→ [概述](./)
