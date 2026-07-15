# IPC 通信

把 Controller 方法映射到 `ipcMain.handle` / `ipcMain.on`，通道名由前缀 + 方法 channel 组成。

## Controller + Handle

```ts
import { Controller, IpcHandle, Inject } from '@electrum/common'
import { UserService, type User } from './user.service'

@Controller('user')
export class UserController {
  @Inject(UserService)
  users!: UserService

  @IpcHandle('list')
  list(): User[] {
    return this.users.list()
  }

  @IpcHandle('get')
  get(id: number): User {
    return this.users.get(id)
  }
}
```

## 通道命名

```
fullChannel = prefix ? `${prefix}:${channel}` : channel
```

上例：`user:list`、`user:get`。  
渲染进程通常：`window.api.invoke('user:list')`。

## `@IpcHandle` vs `@IpcOn`

| 装饰器 | Electron API | 中间件 | 方法参数 |
|--------|--------------|--------|----------|
| `@IpcHandle` | `ipcMain.handle` | 完整管道（Guard → Pipe → Interceptor → Filter） | `(...args)`，不含 event |
| `@IpcOn` | `ipcMain.on` | 仅 Guard | `(event, ...args)` |

`@IpcHandle({ channel, devOnly: true })`：非开发环境跳过注册。

重复通道会警告并跳过，避免二次 `handle` 崩溃。

## 启动时序

`createApp(AppModule).start()` 内部会在扫描完成后把各 Controller 实例交给 IpcBridge 注册。业务侧只需保证模块里声明了对应 `controllers`。

## 类型骨架（可选）

可扫描全部 `@IpcHandle` 生成渲染侧声明骨架：

```ts
createApp(AppModule).generateTypes('src/renderer/types/api.d.ts')
```

当前生成为通道名 → `any` 的骨架，方便起步；精细参数类型可后续手工收紧。详见 [类型生成与插件](/core/types-and-plugins)。

## 下一步

→ [中间件](./middleware)
