# 中间件管道

Controller 上的 `@IpcHandle` 在真正执行业务方法前，会经过一层 NestJS 风格管道（详见 [Controllers](./controllers)）。

一次 `@IpcHandle` 调用会走：

```
Guards → Pipes → Interceptors →（业务方法）→ Filters（仅捕获错误时）
```

四类角色职责不同，但都通过同一套挂载方式接入：  
`@UseGuards` / `@UsePipes` / `@UseInterceptors` / `@UseFilters`，以及 `app.useGlobal*`。  
合并顺序：**global → class → method**（Filter 执行时优先更具体的，见 [Filter](./filters)）。

::: warning 和 NestJS「Middleware」不是一回事
NestJS 里有两类概念，名字容易混：

| NestJS | Electrum |
|--------|----------|
| **Middleware**（`NestMiddleware` / `MiddlewareConsumer.apply()`，类似 Express `(req,res,next)`） | **未实现** |
| **Guards / Pipes / Interceptors / Exception Filters** | **已实现**，文档统称「中间件管道」 |

Electrum 面向的是 Electron **IPC 调用**，没有 HTTP `req`/`res`，因此不引入 Express 式中间件；跨切面能力用 Guard / Pipe / Interceptor / Filter 覆盖。  
若需要「所有通道最外层统一预处理」，可用 **全局 Guard 或全局 Interceptor** 近似替代 Nest Middleware 的常见用法。
:::

## 怎么选

| 需求 | 文档 |
|------|------|
| 能不能调用这条 IPC | [Guard](./guards) |
| 参数怎么变成合法形状 | [Pipe](./pipes) |
| 调用前后打点、计时、改返回值 | [Interceptor](./interceptors) |
| 异常怎么结构化回给渲染进程 | [Filter](./filters) |

## 全局注册

在 `createApp` 之后、`start` 之前：

```ts
import { createApp } from '@electrum/core'
import { AppModule } from './app.module'
import { LoggingInterceptor } from './interceptors/logging.interceptor'
import { GlobalExceptionFilter } from './filters/global-exception.filter'

const app = createApp(AppModule)
app.useGlobalInterceptors(LoggingInterceptor)
app.useGlobalFilters(GlobalExceptionFilter)
// app.useGlobalGuards(...)
// app.useGlobalPipes(...)
await app.start()
```

## `@IpcOn` 注意

事件监听**只跑 Guard**，不跑 Pipe / Interceptor / Filter。详见 [Guard · `@IpcOn` 准入](./guards#5-ipcon-订阅准入)。

实现细节见 [IPC 与中间件](/core/ipc-and-middleware)。

## 下一步

→ [Guard](./guards) · [Pipe](./pipes) · [Interceptor](./interceptors) · [Filter](./filters)  
→ [窗口与生命周期](./windows-lifecycle)
