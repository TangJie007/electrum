# 示例项目

仓库内自带两个示例，用途不同。

## examples/basic — 完整用法

路径：[`examples/basic`](https://github.com/TangJie007/electrum/tree/main/examples/basic)

演示：

- Module / Controller / IPC handlers
- 字段注入与生命周期钩子
- 声明式窗口
- 全局 Filter / Interceptor
- 渲染进程：Vue 3（`src/renderer/App.vue`）

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

推荐对照阅读目录：`src/main/app.module.ts`、`user/`、`file/`、`window/`。

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

- 本站「使用指南」偏怎么写代码
- [深入源码](/core/) 偏实现走读
- 仓库根目录设计方案：[electron-mvc-framework-design.md](https://github.com/TangJie007/electrum/blob/main/electron-mvc-framework-design.md)
- 需求 Spec：[specs/](https://github.com/TangJie007/electrum/tree/main/specs)

## 回到指南

→ [概述](./)
