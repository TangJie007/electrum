# Interceptor

Interceptor 以**洋葱模型**包裹 Controller 方法：在 `next()` 前后插入逻辑，可观察入参上下文、改写返回值，或在失败时做统一处理后再抛出。

它跑在 Guard / Pipe **之后**、业务方法之外（包住调用）。  
**不**做准入（[Guard](./guards)）、**不**专门改造 `args[0]`（[Pipe](./pipes)）。

总览见 [中间件管道](./middleware)。

## 接口

```ts
import type { NestInterceptor, IpcContext } from '@electrum/common'

intercept(context: IpcContext, next: () => Promise<any>): Promise<any>
```

必须调用（或决定不调用）`next()` 才会进入内层 Interceptor / 业务方法。多个 Interceptor 时，**最外层最先进入、最后离开**（与 Nest 一致）。

## 挂载

```ts
import { Injectable, UseInterceptors, Controller, IpcHandle } from '@electrum/common'
import type { NestInterceptor, IpcContext } from '@electrum/common'

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  async intercept(context: IpcContext, next: () => Promise<any>) {
    const start = Date.now()
    const result = await next()
    console.log(`[IPC] ${context.channel} ${Date.now() - start}ms`)
    return result
  }
}

@UseInterceptors(LoggingInterceptor)
@Controller('file')
export class FileController {
  @IpcHandle('read')
  read(path: string) {
    /* ... */
  }
}
```

也可方法级挂载，或 `app.useGlobalInterceptors(LoggingInterceptor)`。  
`examples/basic` 即用全局 `LoggingInterceptor` 打印耗时。

合并顺序：**global → class → method**（再按洋葱从外到内执行）。

## 使用场景

### 1. 日志与耗时统计

统一记录通道名、耗时、成败，避免每个 handler 手写 `console.time`。

```ts
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  async intercept(context: IpcContext, next: () => Promise<any>) {
    const start = Date.now()
    try {
      const result = await next()
      console.log(`[IPC] ${context.channel} ok ${Date.now() - start}ms`)
      return result
    } catch (err) {
      console.error(`[IPC] ${context.channel} fail ${Date.now() - start}ms`, err)
      throw err
    }
  }
}
```

### 2. 给返回值加信封 / 元数据

在不改 Controller 签名的前提下，统一包一层 `{ data, channel, at }`，或剥掉内部字段再给渲染进程。

```ts
@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  async intercept(context: IpcContext, next: () => Promise<any>) {
    const data = await next()
    return { data, channel: context.channel, at: Date.now() }
  }
}
```

### 3. 缓存命中（只读通道）

对幂等查询可按 `channel + args` 做短时缓存；写操作通道跳过。

```ts
@Injectable()
export class CacheInterceptor implements NestInterceptor {
  private cache = new Map<string, { at: number; value: unknown }>()

  async intercept(context: IpcContext, next: () => Promise<any>) {
    if (!context.channel.endsWith(':list') && !context.channel.endsWith(':get')) {
      return next()
    }
    const key = `${context.channel}:${JSON.stringify(context.args)}`
    const hit = this.cache.get(key)
    if (hit && Date.now() - hit.at < 3_000) return hit.value
    const value = await next()
    this.cache.set(key, { at: Date.now(), value })
    return value
  }
}
```

### 4. 超时控制

桌面 IPC 里偶发阻塞时，用 `Promise.race` 限制等待时间，超时抛业务异常再交 [Filter](./filters)。

```ts
import { ElectronException } from '@electrum/common'

const IPC_TIMEOUT_MS = 10_000

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  async intercept(_ctx: IpcContext, next: () => Promise<any>) {
    return Promise.race([
      next(),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new ElectronException('IPC timeout', 'TIMEOUT', 408)),
          IPC_TIMEOUT_MS,
        ),
      ),
    ])
  }
}
```

### 5. 审计：记录谁在何时调了敏感通道

结合 `event.sender` 与通道名写审计日志，业务方法保持干净。

```ts
import { BrowserWindow } from 'electron'

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  async intercept(context: IpcContext, next: () => Promise<any>) {
    const win = BrowserWindow.fromWebContents(context.event.sender)
    console.log(`[audit] ${context.channel} from win=${win?.id}`)
    return next()
  }
}
```

## 与其它中间件的边界

| 需求 | 用 |
|------|----|
| 能不能调用 | [Guard](./guards) |
| 参数怎么变成合法形状 | [Pipe](./pipes) |
| 打点、计时、改返回值 | **Interceptor** |
| 异常怎么回给渲染进程 | [Filter](./filters) |

## 下一步

→ [Filter](./filters)  
← [Pipe](./pipes) · [中间件管道](./middleware)
