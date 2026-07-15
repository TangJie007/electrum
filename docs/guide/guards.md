# Guard

Guard 只负责**准入**：在 Pipe / Interceptor / 业务方法之前决定「能不能进」。

`canActivate` 返回 `false` → 抛 `ForbiddenException` → 由 [Filter](./filters) 变成结构化错误回渲染进程。

Guard **不**变换参数（那是 [Pipe](./pipes)）、**不**包装调用前后（那是 [Interceptor](./interceptors)）。

总览见 [中间件管道](./middleware)。

## 接口与上下文

```ts
import type { CanActivate, IpcContext } from '@electrum/common'

canActivate(context: IpcContext): boolean | Promise<boolean>
```

| 字段 | 说明 |
|------|------|
| `channel` | 完整通道，如 `user:remove` |
| `event` | Electron `IpcMainInvokeEvent` / `IpcMainEvent`（可用 `event.sender`） |
| `args` | 渲染进程传入的业务参数 |
| `controllerClass` / `instance` | 目标 Controller |

## 挂载

```ts
import { Injectable, UseGuards, Controller, IpcHandle } from '@electrum/common'
import type { CanActivate, IpcContext } from '@electrum/common'

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(ctx: IpcContext): boolean {
    return true
  }
}

// 类级：该 Controller 下所有 Handle / On 都过
@UseGuards(AuthGuard)
@Controller('secure')
export class SecureController {
  @IpcHandle('action')
  action() {
    return { ok: true }
  }
}

// 方法级：只拦某一条通道
@Controller('user')
export class UserController {
  @UseGuards(AuthGuard)
  @IpcHandle('remove')
  remove(id: number) {
    /* ... */
  }
}
```

也可 `app.useGlobalGuards(AuthGuard)`。合并顺序：**global → class → method**。

## 使用场景

### 1. 鉴权 / 角色：敏感 IPC 才放行

桌面应用也常有「当前会话用户 / 管理员模式」。写操作挂 Guard，只读接口可不挂。

```ts
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: IpcContext): boolean {
    const session = /* 从 DI 注入的 SessionService */ getSession()
    return session?.role === 'admin'
  }
}

@Controller('user')
export class UserController {
  @UseGuards(AdminGuard)
  @IpcHandle('remove')
  remove(id: number) {
    /* 删除用户 */
  }
}
```

### 2. 按通道白名单 / 功能开关

统一拦一批通道，或按配置关闭整块功能，避免散落在每个 Controller 里 `if`。

```ts
@Injectable()
export class FeatureFlagGuard implements CanActivate {
  canActivate(ctx: IpcContext): boolean {
    if (ctx.channel.startsWith('experimental:')) {
      return process.env.ENABLE_EXPERIMENTAL === '1'
    }
    return true
  }
}

// app.useGlobalGuards(FeatureFlagGuard)
```

### 3. 校验调用来源窗口

多窗口时，用 `event.sender` 判断是否允许某窗调用敏感通道（例如只有主窗能改设置）。

```ts
import { BrowserWindow } from 'electron'

@Injectable()
export class MainWindowOnlyGuard implements CanActivate {
  canActivate(ctx: IpcContext): boolean {
    const win = BrowserWindow.fromWebContents(ctx.event.sender)
    return win?.getTitle().includes('Admin') === true
    // 或对比 win.id / 预先登记的 webContents.id
  }
}
```

### 4. 参数级闸门（粗校验）

在进 Pipe 之前根据 `args` 做快速拒绝。完整校验、改造成 DTO 仍应交给 [Pipe](./pipes)。

```ts
@Injectable()
export class HasIdGuard implements CanActivate {
  canActivate(ctx: IpcContext): boolean {
    const id = ctx.args[0]
    return typeof id === 'number' && id > 0
  }
}
```

### 5. `@IpcOn` 订阅准入

`@IpcOn` **只跑 Guard**（不跑 Pipe / Interceptor / Filter）。适合「能否开始 watch / 订阅某路径」这类单向入口。

```ts
import type { IpcMainEvent } from 'electron'

@UseGuards(PathAllowedGuard)
@IpcOn('watch')
onWatch(event: IpcMainEvent, filePath: string) {
  // 只有 Guard 通过才会进这里
}
```

## 与其它中间件的边界

| 需求 | 用 |
|------|----|
| 能不能调用 | **Guard** |
| 参数怎么变成合法形状 | [Pipe](./pipes) |
| 打点、计时、改返回值 | [Interceptor](./interceptors) |
| 异常怎么回给渲染进程 | [Filter](./filters) |

## 下一步

→ [Pipe](./pipes)  
← [中间件管道](./middleware)
