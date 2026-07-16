# 实现走读（demo）

用 `examples/basic` 里的真实代码，把框架「从装饰器到 Electron」的路径拆开说明。每篇只讲一条链路，建议按顺序读。

## 阅读顺序

| # | 文章 | 你能搞清什么 |
|---|------|--------------|
| 1 | [从 createApp 到 start](./create-app-start) | 启动时谁在什么顺序干活 |
| 2 | [模块扫描与注册](./module-scanner) | `AppModule` 里的类如何进 DI |
| 3 | [@Inject 注入路径](./inject) | `config` 字段何时、如何被赋值 |
| 4 | [@IpcHandle 绑定路径](./ipc-handle) | `'info'` 如何变成 `ipcMain.handle('app:info')` |
| 5 | [一次 invoke 怎么跑完](./middleware-pipeline) | Guard → Pipe → Interceptor → 方法 → Filter |
| 6 | [@IpcEmit 推送路径](./ipc-emit) | 主进程如何主动推消息给渲染进程 |
| 7 | [@AppEvent 绑定路径](./app-event) | `window-all-closed` 如何接到 `app.on` |

对照源码：`examples/basic/src/main/`，框架实现：`packages/core`、`packages/common`。

## 一句话心智模型

```
装饰器（common）只写 Symbol.metadata
        ↓
createApp().start()（core）读 metadata
        ↓
DI 接线 + 绑 ipcMain / app / 窗口
        ↓
渲染进程 invoke / on 才真正打到业务方法
```
