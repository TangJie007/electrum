# @electrum/core 学习指南

本目录说明 **运行时引擎** `@electrum/core` 的实现，帮助你从源码理解 Electrum 如何把装饰器元数据变成真正跑起来的 Electron 主进程应用。

> 装饰器 / 接口 / 异常在 `@electrum/common`（`packages/common`）。  
> Core **依赖** common，负责「扫描 → 装配 → 绑定 IPC → 生命周期」。

写应用请先看 [使用指南](/guide/)；本节偏源码走读。

## 建议阅读顺序

| 顺序 | 文档 | 对应源码 |
|------|------|----------|
| 1 | [架构总览](./architecture) | `application.ts`、`index.ts` |
| 2 | [ModuleScanner 设计](./module-scanner) | `module/scanner.ts` |
| 3 | [模块扫描与 DI](./di-and-modules) | `module/scanner.ts`、`di/container.ts` |
| 4 | [IPC 桥接与中间件](./ipc-and-middleware) | `bridge/ipc-bridge.ts`、`middleware/pipeline.ts` |
| 5 | [窗口 / 事件 / 生命周期](./window-event-lifecycle) | `window/`、`bridge/event-bridge.ts`、`lifecycle/` |
| 6 | [类型生成与插件](./types-and-plugins) | `type-generator/`、`plugin/` |
| 7 | [Specs ↔ Core 对照](./specs-mapping) | `specs/` 与实现覆盖关系 |

边读边对照示例：`examples/basic/src/main/`。

## 一句话定位

```
@electrum/common  = 声明（装饰器写元数据）
@electrum/core    = 执行（读元数据 → 建容器 → 绑 Electron）
```

应用侧日常写法：

```ts
import { Module, Controller, IpcHandle, Injectable, Inject } from '@electrum/common'
import { createApp } from '@electrum/core'

await createApp(AppModule).start()
```

`@electrum/core` 也 **re-export** 了 common 的公共 API（见 `packages/core/src/index.ts`），可以从 core 一把导入；学习时建议分清「声明」和「运行时」。
