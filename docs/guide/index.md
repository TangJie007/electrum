# 概述

Electrum 是面向 **Electron 主进程** 的渐进式框架：用 NestJS 熟悉的装饰器、依赖注入与模块化，组织 IPC、窗口与业务逻辑。

底层仍是 Electron 本身（`ipcMain`、`BrowserWindow`、`app` 事件）。Electrum 不替换这些 API，而是在其上提供一层清晰的应用架构，让主进程代码可测试、可维护、可渐进引入。

## 设计理念

桌面应用主进程常会变成「一个巨大的 `main.ts`」：IPC 监听、窗口创建、业务逻辑缠在一起。Electron 能力很完整，但很少有人替你解决**架构**问题。

Electrum 提供开箱即用的应用结构，灵感来自 NestJS / Angular：

| 概念 | 在 Electrum 中的角色 |
|------|----------------------|
| **Controller** | 处理来自渲染进程的 IPC 调用 |
| **Provider / Service** | 可注入的业务逻辑与工具 |
| **Module** | 把 Controllers、Providers、窗口声明组织在一起 |
| **中间件管道** | Guard → Pipe → Interceptor → Filter |

你可以从单个 Controller 开始接入，不必一次重写整个主进程。

## 核心构件一览

```
渲染进程  ──invoke / send──►  Controller（@IpcHandle / @IpcOn）
                                    │
                                    ▼
                              Service（@Injectable）
                                    │
                                    ▼
                         Window / 文件系统 / 其它 Electron API
```

- **Controllers** — 应用的 IPC 入口。用 `@Controller('file')` 声明前缀，用 `@IpcHandle('read')` 绑定通道 `file:read`。详见 [Controllers](./controllers)。
- **Providers** — 用 `@Injectable()` 标注的服务；通过 `@Inject` 注入到 Controller 或其它服务。详见 [Providers](./providers)。
- **Modules** — `@Module({ controllers, providers, imports, declarations })` 描述一块功能边界。详见 [模块](./modules)。

## 两包分工

```
@electrum/common  = 声明（装饰器写元数据）
@electrum/core    = 执行（读元数据 → 建容器 → 绑 Electron）
```

业务代码从 `@electrum/common` 写声明，用 `@electrum/core` 的 `createApp` 启动。装饰器本身不执行业务逻辑，只向 `Symbol.metadata` 写入配置；真正接线发生在 `createApp(AppModule).start()`。

Electrum 使用 **TypeScript 5 Stage 3 原生装饰器**，不依赖 `experimentalDecorators` 与 `reflect-metadata`。

## 与裸写 Electron 的对比

| 裸写 | Electrum |
|------|----------|
| 在 `main.ts` 手写 `ipcMain.handle` | `@Controller` + `@IpcHandle` 自动注册 |
| 到处 `new Service()` | DI 容器统一接线 |
| 窗口创建散落各处 | `@WindowDeclaration` + 模块 `declarations` |
| 错误处理各自 `try/catch` | Filter 管道统一为 `IpcErrorResponse` |

## 下一步

→ [快速开始](./getting-started)
