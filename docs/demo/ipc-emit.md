# @IpcEmit 推送路径

以 `FileController` 为例（比 `AppController` 更完整）：

```ts
// examples/basic/src/main/file/file.controller.ts
@Controller({ prefix: 'file', window: 'main' })
export class FileController {
  @IpcEmit('saved')
  notifySaved!: (path: string) => void

  @IpcHandle('write')
  async write(data: { path: string; content: string }) {
    await this.fileService.write(data.path, data.content)
    this.notifySaved(data.path)  // 主进程 → 渲染进程
    return { ok: true, path: data.path }
  }
}
```

## 阶段一：装饰器记账

`@IpcEmit('saved')` 往 `META.INJECTIONS` 推（注意：和 `@Inject` **同一张列表**，用 `type` 区分）：

```ts
{
  propertyKey: 'notifySaved',
  type: 'emit',
  emitChannel: 'saved',
  // emitWindow 可选，覆盖 Controller.window
}
```

不创建函数，字段暂时为空。

## 阶段二：resolve 时注入函数

`IpcBridge` → `resolve(FileController)` → DI 处理 `type: 'emit'`：

```ts
const fullChannel = prefix ? `${prefix}:${channel}` : channel
// → 'file:saved'

const target = emitWindow ?? controllerWindow ?? 'main'
// → 'main'

instance.notifySaved = (...args) => {
  this.windowSender(target, fullChannel, ...args)
}
```

`windowSender` 在 `Application.start` 里设好：

```ts
container.setWindowSender((target, channel, ...args) => {
  if (target === 'broadcast') windowManager.broadcast(channel, ...args)
  else windowManager.sendTo(target, channel, ...args)
})
```

`sendTo` → `BrowserWindow.webContents.send(channel, ...args)`。

## 阶段三：业务调用 + 渲染收听

```
this.notifySaved(path)
  → windowSender('main', 'file:saved', path)
  → webContents.send('file:saved', path)
  → 渲染：api.on('file:saved', handler)   // preload 包了 ipcRenderer.on
```

## 和 @IpcHandle 方向对比

| | Handle | Emit |
|--|--------|------|
| 方向 | 渲染 → 主 | 主 → 渲染 |
| 装饰位置 | 方法 | 字段（注入函数） |
| Electron | `invoke` / `handle` | `webContents.send` / `ipcRenderer.on` |
| 通道例 | `file:write` | `file:saved` |

## 小结

`@IpcEmit` 不注册 `ipcMain` 监听；它在 **resolve** 时注入「调用即 send」的函数。  
目标窗来自 `@IpcEmit({ window })` → `@Controller({ window })` → 默认 `'main'`。
