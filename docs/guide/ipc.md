# IPC 通信（补充）

日常用法请先阅读 [Controllers](./controllers)：通道前缀、`@IpcHandle` / `@IpcOn`、模块注册与返回值都在该章说明。

本页仅补充启动时序与类型生成入口。

## 启动时序

`createApp(AppModule).start()` 内部在**窗口初始化之后**，由 `IpcBridge` resolve 各 Controller 并绑定 `ipcMain`。业务侧只需在模块的 `controllers` 中声明类即可。

为何在创窗之后？Controller 上可能有 `@WindowRef`；若先 resolve 再创窗，注入会失败。详见 [架构总览](/core/architecture)。

## 类型骨架

```ts
createApp(AppModule).generateTypes('src/renderer/types/api.d.ts')
```

实现细节见 [类型生成与插件](/core/types-and-plugins)。管道行为见 [中间件](./middleware) 与 [IPC 与中间件](/core/ipc-and-middleware)。

## 渲染侧调用

- Preload 桥：[`@electrum/preload`](./preload) → `exposeApi()`
- 嵌套客户端：[`@electrum/client`](./client) → `createClient()` / `api.user.list()`

## 下一步

→ [Preload](./preload)  
→ [Client](./client)  
→ [中间件](./middleware)
