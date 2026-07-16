# @AppEvent 绑定路径

仍在 `AppController`：

```ts
@AppEvent('window-all-closed')
onAllClosed() {
  if (process.platform !== 'darwin') {
    app.quit()
  }
}
```

这不是 IPC，而是 Electron **`app` 生命周期事件**。

## 路径

```
类加载：@AppEvent 写入 META.APP_EVENT
  { event: 'window-all-closed', method: 'onAllClosed' }

Application.start() 第 5 步：
  EventBridge.registerAll()
    → 扫 scannedModules 的 controllers + providers
    → resolve 实例
    → 读 APP_EVENT
    → electronApp.on('window-all-closed', () => instance.onAllClosed(...))
```

源码：`packages/core/src/bridge/event-bridge.ts`。

## 和 IpcBridge 的分工

| | IpcBridge | EventBridge |
|--|-----------|-------------|
| 装饰器 | `@IpcHandle` / `@IpcOn` | `@AppEvent` |
| Electron | `ipcMain` | `app.on` |
| 对端 | 渲染进程 | Electron 主进程自身 |

## 小结

`@AppEvent` 同样是「装饰器记账 + start 时接线」。  
区别只是接到 `app`，不是 `ipcMain`。
