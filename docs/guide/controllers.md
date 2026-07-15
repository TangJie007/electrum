# Controllers

Controllers 负责处理**传入的 IPC 请求**，并把结果返回给渲染进程（或其它调用方）。

一个 Controller 通常对应一组相关通道。路由机制（在此即通道命名）决定每个请求由哪个方法处理。一个 Controller 可以挂多个 handler，每个 handler 做不同的事。

创建 Controller 使用**类 + 装饰器**。装饰器把类与所需元数据关联起来，这样 Electrum 能在启动时建立「通道 → 方法」的映射，并接到 Electron 的 `ipcMain`。

::: tip 提示
Electrum 里的 Controller **不是** HTTP Controller。对应关系大致是：NestJS 的路由 ↔ Electron 的 IPC 通道；`@Get()` / `@Post()` ↔ `@IpcHandle()` / `@IpcOn()`。

**方向要分清：**

| 方向 | Electrum 做法 |
|------|----------------|
| 渲染 → 主（请求-响应） | `@IpcHandle` + 渲染侧 `invoke` |
| 渲染 → 主（单向） | `@IpcOn` + 渲染侧 `send` |
| 主 → 渲染（推送） | `@IpcEmit` + Controller `window`（或 `webContents.send` / `sendTo` / `event.reply`），渲染侧 `on` |

`@IpcHandle` / `@IpcOn` **只注册主进程入站监听**。主进程主动推 UI 用 `@IpcEmit`，见下方 [主进程 → 渲染进程](#主进程--渲染进程)。
:::

## 通道前缀（Routing）

使用 `@Controller()` 声明一个 Controller。可传字符串前缀，或对象同时指定默认推送窗口：

```ts
@Controller('file')
// 或
@Controller({ prefix: 'file', window: 'main' })
```

前缀用来把相关 handler / emit 归为一组。例如，文件相关 IPC 都放在 `file` 前缀下：

```ts
import { Controller, IpcHandle, Inject } from '@electrum/common'
import { FileService } from './file.service'

@Controller({ prefix: 'file', window: 'main' })
export class FileController {
  @Inject(FileService)
  fileService!: FileService

  @IpcHandle('read')
  async read(filePath: string): Promise<string> {
    return this.fileService.read(filePath)
  }
}
```

方法上的 `@IpcHandle('read')` 告诉框架：为这个方法注册一个 `ipcMain.handle`。完整通道名由 **Controller 前缀 + 方法 channel** 组成：

```
fullChannel = prefix ? `${prefix}:${channel}` : channel
```

上例中，渲染进程应调用 `file:read`：

```ts
// preload / renderer
import { createClient } from '@electrum/client'

const api = createClient<IpcApi>()
const content = await api.file.read('/path/to/file')
```

若 Controller 前缀为 `file`，方法装饰器为 `@IpcHandle('write')`，则通道为 `file:write`。方法名本身（如 `read`、`write`）可以任意选择，框架不依赖方法名做路由。

不含前缀时亦可：

```ts
@Controller()
export class AppController {
  @IpcHandle('ping')
  ping() {
    return 'pong'
  }
}
// 通道即为 ping
```

## `@IpcHandle`

对应 Electron 的 `ipcMain.handle`。渲染进程用 **`ipcRenderer.invoke`**（经 `@electrum/preload` 暴露为 `window.api.invoke`，或 `@electrum/client` 的 `api.xxx.yyy()`）发起一次**请求-响应**调用；主进程方法 `return` 的值（或 Promise）会回到调用方。

**适合：**

- CRUD、读配置、读文件、计算并拿结果——「问一句、答一句」
- 需要 `await`、错误要传到渲染进程的业务
- 希望走完整中间件（Guard / Pipe / Interceptor / Filter）
- 生成渲染侧类型骨架（`generateTypes` 只扫 `@IpcHandle`）

**方法签名：** `(...args)`，框架会剥掉 `event`，你只写业务参数。

```ts
@Controller('user')
export class UserController {
  @Inject(UserService)
  users!: UserService

  // 渲染: await api.user.list()  或  window.api.invoke('user:list')
  @IpcHandle('list')
  list() {
    return this.users.list()
  }

  // 渲染: await api.user.get(1)
  @IpcHandle('get')
  get(id: number) {
    return this.users.get(id)
  }
}
```

可选 `{ devOnly: true }`：仅开发环境注册，可放调试通道。

同步 `return` 或 `async` 都可以。异常会被 Filter 收成 `IpcErrorResponse`，而不是直接打挂 IPC。

::: tip 一边 return、一边推送
Handle 内部可用 `@IpcEmit` 主动通知渲染进程（见下文），不必再手写 `webContents.send`：

```ts
@IpcEmit('saved')
notifySaved!: (path: string) => void

@IpcHandle('write')
async write(data: { path: string; content: string }) {
  await this.fileService.write(data.path, data.content)
  this.notifySaved(data.path)
  return { ok: true as const, path: data.path }
}
```
:::

## `@IpcOn`

对应 Electron 的 `ipcMain.on`。渲染进程用 **`ipcRenderer.send`**（示例里常是 `window.api.send`）发**单向消息**；主进程**没有**「这次调用的 return 值」会自动回给渲染进程。

**适合：**

- 只通知、不关心主进程返回值（打点、取消、开始监听）
- 需要拿到 `IpcMainEvent`，用 `event.reply(...)` **多次 / 持续**回推（文件 watch、进度、订阅）
- 需要 `event.sender` 等事件对象上的能力

**方法签名：** `(event, ...args)`，第一个参数是 Electron 事件。

中间件只跑 **Guard**，不跑 Pipe / Interceptor / Filter。

```ts
import type { IpcMainEvent } from 'electron'

@Controller('file')
export class FileController {
  // 渲染: window.api.send('file:watch', path)
  // 主进程可持续 event.reply('file:changed', ...)
  @IpcOn('watch')
  onWatch(event: IpcMainEvent, filePath: string): void {
    this.fileService.watch(filePath, (change) => {
      event.reply('file:changed', { path: filePath, ...change })
    })
  }
}
```

`event.reply` 的通道名是你自己定的另一条通道，渲染进程要自己 `ipcRenderer.on('file:changed', ...)`（或 preload 暴露的 `on`）。

## 怎么选

| 场景 | 用 |
|------|-----|
| 调用后要拿到结果 / 用 `await` | `@IpcHandle` |
| 主进程主动推到渲染进程 | `@IpcEmit` |
| 一次调用、多次推送或长期订阅 | `@IpcOn` + `event.reply` |
| 只通知主进程、不要返回值 | `@IpcOn`（或 Handle 也行，但 On 更贴切） |
| 需要 Guard→Pipe→Filter 整条链 | `@IpcHandle` |
| 开发期调试专用通道 | `@IpcHandle(..., { devOnly: true })` |

日常业务优先 `@IpcHandle`；需要事件流再用 `@IpcOn`。

## 主进程 → 渲染进程

推荐用 **`@IpcEmit`**（属性注入）：调用字段函数即向目标窗口 `webContents.send`。通道命名与 `@IpcHandle` 相同（`prefix:channel`）。目标窗：`@IpcEmit` 的 `window` → Controller 的 `window` → 默认 `'main'`；传 `'broadcast'` 则广播到所有窗口。

```ts
@Controller({ prefix: 'file', window: 'main' })
export class FileController {
  @IpcEmit('saved')
  notifySaved!: (path: string) => void

  @IpcEmit('toast', { window: 'broadcast' })
  toastAll!: (msg: string) => void

  @IpcHandle('write')
  async write(data: { path: string; content: string }) {
    await this.fileService.write(data.path, data.content)
    this.notifySaved(data.path) // → file:saved 推到 main
    return { ok: true as const, path: data.path }
  }
}

// 渲染: window.api.on('file:saved', (path) => { ... })
```

Emit **不走** Guard / Pipe / Interceptor / Filter（出站推送，不是入站 IPC）。

### 其它写法（补充）

| 方式 | 适用 |
|------|------|
| `@WindowRef` + `webContents.send` | 需要直接操作 `BrowserWindow` |
| `WindowManager.sendTo` / `broadcast` | 跨模块 / 插件里拿 manager 推送 |
| `@IpcOn` 里的 `event.reply` | 回给**本次请求方**（订阅、进度、watch） |

```ts
@IpcOn('watch')
onWatch(event: IpcMainEvent, filePath: string): void {
  this.fileService.watch(filePath, (change) => {
    event.reply('file:changed', { path: filePath, ...change })
  })
}
```

```
渲染 ──invoke──► @IpcHandle ──return──► 渲染     （请求-响应）
渲染 ──send────► @IpcOn                          （单向进主进程）
主进程 ──@IpcEmit / sendTo / reply──► 渲染       （主进程主动推）
```

## 注册到模块

Controller 必须出现在某个 `@Module` 的 `controllers` 数组中，才会被扫描并绑定：

```ts
import { Module } from '@electrum/common'
import { FileController } from './file.controller'
import { FileService } from './file.service'

@Module({
  controllers: [FileController],
  providers: [FileService],
})
export class FileModule {}
```

启动时 `createApp(AppModule).start()` 会 resolve 各 Controller，并由 `IpcBridge` 按 `prefix:channel` 注册到 `ipcMain`。业务侧不必手写 `ipcMain.handle`。

重复通道名会打警告并跳过，避免二次 `handle` 导致崩溃。

## 开发专用通道

```ts
@IpcHandle('debugDump', { devOnly: true })
debugDump() {
  return { /* ... */ }
}
```

`devOnly: true` 时，非开发环境会跳过注册。

## 与中间件配合

可在类或方法上使用 `@UseGuards` / `@UsePipes` / `@UseInterceptors` / `@UseFilters`。合并顺序为 **global → class → method**。

```ts
import { Controller, IpcHandle, UseInterceptors } from '@electrum/common'
import { LoggingInterceptor } from '../interceptors/logging.interceptor'

@Controller('file')
@UseInterceptors(LoggingInterceptor)
export class FileController {
  @IpcHandle('read')
  read(filePath: string) {
    return '...'
  }
}
```

详见 [中间件管道](./middleware)：[Guard](./guards) · [Pipe](./pipes) · [Interceptor](./interceptors) · [Filter](./filters)。

## 类型骨架（可选）

可扫描全部 `@IpcHandle` 生成渲染侧声明骨架：

```ts
createApp(AppModule).generateTypes('src/renderer/types/api.d.ts')
```

当前生成为通道名 → `any` 的起步骨架；更精细的参数类型可手工收紧。实现细节见 [类型生成与插件](/core/types-and-plugins)。

## 完整示例

仓库 [`examples/basic`](https://github.com/TangJie007/electrum/tree/main/examples/basic) 中的 `FileController` / `UserController` 展示了 Handle、On、窗口注入与 Interceptor。

## 下一步

→ [Providers](./providers)  
→ [Preload](./preload) / [Client](./client)（渲染侧怎么调这些通道）
