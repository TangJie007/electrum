# 中间件

一次 `@IpcHandle` 调用会走管道：

```
Guards → Pipes → Interceptors →（业务方法）→ Filters（仅捕获错误时）
```

装饰器：`@UseGuards` / `@UsePipes` / `@UseInterceptors` / `@UseFilters`。  
合并顺序：**global → class → method**。

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
await app.start()
```

## Guard

任一 `canActivate` 返回 `false` → 抛 `ForbiddenException`。

```ts
import { Injectable, UseGuards } from '@electrum/common'
import type { CanActivate, IpcContext } from '@electrum/common'

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(ctx: IpcContext): boolean {
    return true // 按业务校验
  }
}

@UseGuards(AuthGuard)
@Controller('secure')
export class SecureController {
  // ...
}
```

## Pipe

按 global → class → method 依次 `transform`，通常作用于第一个业务参数。

## Interceptor

可包裹调用前后逻辑（日志、计时等）。示例见 `examples/basic` 的 `LoggingInterceptor`。

## Filter

捕获管道中的异常，转成结构化 `IpcErrorResponse`（含 `__error: true`），避免未捕获异常直接冒泡到 Electron。

```ts
@Injectable()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, _context: IpcContext): IpcErrorResponse {
    if (exception instanceof ElectronException) {
      return exception.toJSON()
    }
    // ...
  }
}
```

内置异常：`ElectronException`、`NotFoundException`、`ForbiddenException`、`ValidationException`。

## `@IpcOn` 注意

事件监听只跑 **Guard**，不跑完整 Pipe / Interceptor / Filter 链。

更多实现细节见 [IPC 与中间件](/core/ipc-and-middleware)。

## 下一步

→ [窗口与生命周期](./windows-lifecycle)
