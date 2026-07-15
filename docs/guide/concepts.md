# 核心概念

本页补充概述之外的几条约定。若尚未阅读，建议先看 [概述](./) 与 [Controllers](./controllers)。

## 装饰器心智模型

1. **装饰器不执行业务逻辑**，只往类 / 成员的 `Symbol.metadata` 写入配置。
2. **启动时** `createApp(AppModule).start()` 会：扫描模块树 → 注册 DI → 建窗口 → 绑 IPC / 事件 → 调生命周期钩子。
3. Electrum 使用 **TypeScript 5 Stage 3 原生装饰器**，不依赖 `experimentalDecorators` 和 `reflect-metadata`。

## 两包分工

| 包 | 职责 | 典型导出 |
|----|------|----------|
| `@electrum/common` | 装饰器、接口、异常、Logger | `Module`、`Injectable`、`Controller`、`IpcHandle`、`Inject` |
| `@electrum/core` | 运行时引擎 | `createApp`、DI、扫描、IPC / Event bridge、窗口管理 |

业务代码日常从 `@electrum/common` 写声明，用 `@electrum/core` 的 `createApp` 启动。  
`@electrum/core` 也会 re-export common 的公共 API，可以从 core 一把导入；学习时建议分清「声明」和「运行时」。

## 能力一览（v0.1）

- `@Module` / `@Injectable` / `@Controller` / `@IpcHandle` / `@IpcOn` / `@AppEvent`
- 属性注入 `@Inject` / `@WindowRef` / `@Optional`
- DI 容器、模块扫描、IPC / Event 桥接
- 声明式窗口 `@WindowDeclaration`
- 中间件链（Guard / Pipe / Interceptor / Filter）
- 生命周期钩子、日志、异常类型
- IPC 通道类型骨架生成（`generateTypes`）

## 渐进式引入

可以从单个 Controller 开始，不必一次重构所有主进程代码。框架不封装 Electron API 本身，只提供组织层。

## 下一步

→ [Controllers](./controllers)
