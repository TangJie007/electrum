# @electrum/core 源码笔记

本节是 `@electrum/core` 运行时引擎的**源码走读笔记**，对应英文版 [`docs/en/core/`](../en/core/index)。

> 这些页面通过 `.vitepress/config/shared.mts` 的 `srcExclude: ['core/**']` **不进文档站**，只在仓库里阅读。
> 面向使用者的公开文档在 [`docs/guide/`](../guide/index)；发布在站点上的走读专栏在 [`docs/demo/`](../demo/index)。

## 一句话定位

```
@electrum/common   = 声明（装饰器写 metadata）
@electrum/core     = 执行（读 metadata → 建容器 → 绑 Electron）
@electrum/preload  = preload 桥
@electrum/client   = 渲染侧客户端
```

`core` 依赖 `common`，负责「扫描 → 装配 → 绑 IPC → 生命周期」。

## 阅读顺序

| # | 主题 | 中文笔记 | 源码 |
|---|------|----------|------|
| 0 | 架构总览 | [设计原则与实现原理](../demo/design-principles) | `application.ts` |
| 1 | 启动链路 | [从 createApp 到 start](../demo/create-app-start) | `application.ts` |
| 2 | 模块扫描 | [ModuleScanner 设计](./module-scanner) | `module/scanner.ts` |
| 3 | 依赖注入 | [模块扫描与注册](../demo/module-scanner) · [@Inject 注入路径](../demo/inject) | `di/container.ts` |
| 4 | IPC 与中间件 | [IPC 事件管理](../demo/ipc-event-management) · [一次 invoke 怎么跑完](../demo/middleware-pipeline) | `bridge/ipc-bridge.ts`、`middleware/pipeline.ts` |
| 5 | 窗口 / 事件 / 生命周期 | [@IpcEmit 推送路径](../demo/ipc-emit) · [@AppEvent 绑定路径](../demo/app-event) | `window/`、`bridge/event-bridge.ts`、`lifecycle/` |
| 6 | 类型生成与插件 | 见 [设计原则 §12](../demo/design-principles) | `@electrum/codegen`、`plugin/` |
| 7 | Specs ↔ Core 映射 | 英文版 [specs-mapping](../en/core/specs-mapping) | `specs/` |

英文版 [`docs/en/core/`](../en/core/index) 第 2、3、4、5 项有独立页面（`module-scanner` / `di-and-modules` / `ipc-and-middleware` / `window-event-lifecycle`），中文版对应内容目前分散在 `docs/demo/` 各篇与本页第 2 项，尚未逐篇补齐。

## 核心结论速记

1. 装饰器只写 `Symbol.metadata`，`start()` 才接线
2. 属性注入（Stage 3 无参数装饰器）→ **构造函数里访问不到注入字段**
3. 先 `WindowManager.initialize` 再 `IpcBridge.registerAll`
4. channel = `prefix ? prefix + ':' + channel : channel`
5. Provider 默认 singleton，无 Nest 式模块 `exports` 边界

配合示例阅读：`examples/basic/src/main/`。
