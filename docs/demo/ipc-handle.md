# @IpcHandle 绑定路径

以这一行为例：

```ts
// examples/basic/src/main/app.controller.ts
@Controller('app')
export class AppController {
  @IpcHandle('info')
  getInfo() { ... }
}
```

最终效果：主进程上有 `ipcMain.handle('app:info', ...)`；渲染侧 `api.app.info()` 会打到 `getInfo()`。

## 阶段一：装饰器只记账

`@IpcHandle('info')`（`packages/common`）往类 metadata 推：

```ts
// META.IPC_HANDLE
{ channel: 'info', method: 'getInfo', options?: ... }
```

`@Controller('app')` 另存：

```ts
// META.CONTROLLER
{ prefix: 'app' }
```

此时 **没有** 调用 `ipcMain.handle`。

## 阶段二：启动时挂到 ipcMain

[start 时序](./create-app-start) 第 4 步：

```
IpcBridge.registerAll()
  → 遍历 scannedModules 的 controllers
  → registerController(AppController)
```

`registerController`（`packages/core/src/bridge/ipc-bridge.ts`）关键步骤：

```
1. instance = container.resolve(AppController)
   // 顺带完成 @Inject 等属性注入，见「@Inject 注入路径」

2. prefix = readMetadata(CONTROLLER).prefix  → 'app'

3. handleMethods = readMetadata(IPC_HANDLE)
   // 含 { channel: 'info', method: 'getInfo' }

4. fullChannel = 'app' + ':' + 'info'  → 'app:info'

5. ipcMain.handle('app:info', async (_event, ...args) => {
     return pipeline.execute({
       type: 'handle',
       instance,
       method: 'getInfo',
       channel: 'app:info',
       event: _event,
       args,
     })
   })

6. registeredChannels.add('app:info')
```

到这里，**事件才真正绑上 Electron**。

## 阶段三：渲染进程怎么打进来

```
Vue: api.app.info()
  → @electrum/client Proxy → window.api.invoke('app:info')
  → preload exposeApi → ipcRenderer.invoke('app:info')
  → 主进程已注册的 ipcMain.handle('app:info')
  → MiddlewarePipeline.execute → instance.getInfo()
  → 返回值经 Promise 回渲染
```

类型约定见 `examples/basic/src/renderer/ipc-api.ts` 的 `'app:info'`。

## 通道命名规则

| 装饰器 | 结果 |
|--------|------|
| `@Controller('app')` + `@IpcHandle('info')` | `app:info` |
| 无 prefix + `@IpcHandle('ping')` | `ping` |
| `@Controller({ prefix: 'file' })` + `@IpcHandle('read')` | `file:read` |

同名 channel 第二次注册会 warn 并 skip（`registeredChannels` 去重）。

## 和 @IpcOn 的差别（同文件另一条路径）

| | `@IpcHandle` | `@IpcOn` |
|--|--------------|----------|
| Electron API | `ipcMain.handle` | `ipcMain.on` |
| 渲染侧 | `invoke` | `send` |
| 管线 | 完整 MiddlewarePipeline | 仅 Guard |
| 返回值 | 有 | 无 |

## 小结

`@IpcHandle('info')` ≠ 绑事件；它只声明「短名 `info` + 方法 `getInfo`」。  
`IpcBridge` 用 Controller prefix 拼成 `app:info`，再 `ipcMain.handle`。  
请求怎么进业务方法见 [一次 invoke 怎么跑完](./middleware-pipeline)。
