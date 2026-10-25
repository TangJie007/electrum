# Filter

Filter 负责**把管道中的异常变成结构化 `IpcErrorResponse`**，避免未捕获错误直接冒泡到 Electron。

它只在 Guard / Pipe / Interceptor / Controller **抛错时**进入；成功路径不调用 Filter。

渲染侧需识别 `__error: true` 再 `throw`（可用 `@electrum/preload` 的 `exposeApi()`）。详见 [Preload](./preload)、[Client](./client)。

总览见 [中间件管道](./middleware)。

## 接口与响应形状

```ts
import type { ExceptionFilter, IpcContext, IpcErrorResponse } from '@electrum/common'

catch(exception: unknown, context: IpcContext): IpcErrorResponse
```

期望返回：

```ts
{
  __error: true
  code: string
  message: string
  details?: unknown
  stack?: string // 通常仅 dev
}
```

内置异常：`ElectronException`、`NotFoundException`、`ForbiddenException`、`ValidationException`（均带 `toJSON()`）。

## 挂载

```ts
import { Injectable, ElectronException, UseFilters } from '@electrum/common'
import type { ExceptionFilter, IpcContext, IpcErrorResponse } from '@electrum/common'

@Injectable()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, _context: IpcContext): IpcErrorResponse {
    if (exception instanceof ElectronException) {
      return exception.toJSON()
    }
    if (exception instanceof Error) {
      return {
        __error: true,
        code: 'INTERNAL',
        message: exception.message,
        ...(process.env.NODE_ENV?.includes('dev') ? { stack: exception.stack } : {}),
      }
    }
    return { __error: true, code: 'UNKNOWN', message: 'An unknown error occurred' }
  }
}
```

推荐启动时全局注册（`examples/basic` 即如此）：

```ts
app.useGlobalFilters(GlobalExceptionFilter)
```

也可 `@UseFilters(...)` 挂在类或方法上。  
**执行优先顺序与 Guard 相反：method → class → global**（更具体的先处理）；按类型命中的第一个 Filter 执行并返回。

无任何 Filter 命中时，框架有默认 `INTERNAL` / `UNKNOWN` 回退。

## 用 `@Catch()` 声明接管哪些异常

```ts
import {
  Catch,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ValidationException,
} from '@electrum/common'

@Injectable()
@Catch(NotFoundException)
export class NotFoundFilter implements ExceptionFilter {
  catch(exception: NotFoundException): IpcErrorResponse {
    return { __error: true, code: 'NOT_FOUND', message: exception.message }
  }
}

@Injectable()
@Catch(ValidationException, ForbiddenException)
export class ClientErrorFilter implements ExceptionFilter {
  catch(exception: ValidationException | ForbiddenException): IpcErrorResponse {
    return exception.toJSON()
  }
}

@Injectable()
@Catch()                    // 空列表 = catch-all，兜底
export class FallbackFilter implements ExceptionFilter {
  catch(exception: unknown, ctx: IpcContext): IpcErrorResponse {
    return { __error: true, code: 'INTERNAL', message: `[${ctx.channel}] ${String(exception)}` }
  }
}
```

| 写法 | 匹配范围 |
|------|----------|
| `@Catch(NotFoundException)` | `instanceof` 命中，含子类 |
| `@Catch(A, B)` | 命中任一即可 |
| `@Catch()` | catch-all |
| 不写 `@Catch` | catch-all（向后兼容） |

分派规则：

1. 候选顺序 method → class → global，逐个读 `META.CATCH` 做 `instanceof` 判断；
2. **第一个命中的执行并返回**，类型不匹配的会被跳过——所以「方法级只处理 `ValidationException` + 全局兜底」可以共存；
3. Filter 自身抛错时记 `logger.error` 并继续匹配下一个，最终回落到内置序列化；
4. 原始值（`throw 'oops'`、`null`）只能被 catch-all 接住。

> 注意：`@Catch` 只影响普通 `@IpcHandle` 这条管线。`@IpcOn` 走 `executeGuardOnly`，不执行 Filter（异常只记日志）。

## 使用场景

### 1. 全局统一错误契约

所有 IPC 失败都变成同一种 JSON，渲染进程用 `IpcError.code` 分支提示，而不是拼字符串。

```ts
app.useGlobalFilters(GlobalExceptionFilter)
```

### 2. 按业务码映射文案 / 脱敏

生产环境隐藏内部堆栈与 SQL/路径细节，只回安全 message；开发环境保留 `stack`。

```ts
@Injectable()
export class SafeExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, _ctx: IpcContext): IpcErrorResponse {
    if (exception instanceof ElectronException) {
      const json = exception.toJSON()
      if (!process.env.NODE_ENV?.includes('dev')) {
        delete json.stack
        if (json.code === 'INTERNAL') json.message = '内部错误'
      }
      return json
    }
    return { __error: true, code: 'UNKNOWN', message: '未知错误' }
  }
}
```

### 3. 领域异常 → 稳定 code

Service 抛 `NotFoundException` / `ValidationException`，Filter 只做 `toJSON()` 透传，Controller 保持干净。

```ts
// UserService
get(id: number) {
  const user = this.users.get(id)
  if (!user) throw new NotFoundException(`user:${id}`)
  return user
}

// Filter
catch(exception: unknown) {
  if (exception instanceof ElectronException) return exception.toJSON()
  // ...
}
```

### 4. 针对某 Controller 的专属 Filter

文件模块希望额外带上 `path` 到 `details`，其它模块用全局 Filter。

```ts
@Injectable()
export class FileExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, context: IpcContext): IpcErrorResponse {
    const base =
      exception instanceof ElectronException
        ? exception.toJSON()
        : { __error: true as const, code: 'INTERNAL', message: String(exception) }
    return {
      ...base,
      details: { ...(base.details as object), channel: context.channel, args: context.args },
    }
  }
}

@UseFilters(FileExceptionFilter)
@Controller('file')
export class FileController { /* ... */ }
```

### 5. 把第三方错误归类

捕获 Node `ENOENT`、系统 API 错误等，转成自己的 code，避免把原始 `Error.message` 直接甩给 UI。

```ts
@Injectable()
export class FsExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, _ctx: IpcContext): IpcErrorResponse {
    if (exception && typeof exception === 'object' && 'code' in exception) {
      const code = String((exception as NodeJS.ErrnoException).code)
      if (code === 'ENOENT') {
        return { __error: true, code: 'NOT_FOUND', message: '文件不存在' }
      }
      if (code === 'EACCES') {
        return { __error: true, code: 'FORBIDDEN', message: '无权限访问文件' }
      }
    }
    if (exception instanceof ElectronException) return exception.toJSON()
    return { __error: true, code: 'INTERNAL', message: '文件操作失败' }
  }
}
```

## 与其它中间件的边界

| 需求 | 用 |
|------|----|
| 能不能调用 | [Guard](./guards) |
| 参数怎么变成合法形状 | [Pipe](./pipes) |
| 打点、计时、改返回值 | [Interceptor](./interceptors) |
| 异常怎么回给渲染进程 | **Filter** |

## 下一步

→ [窗口与生命周期](./windows-lifecycle)  
← [Interceptor](./interceptors) · [中间件管道](./middleware)
