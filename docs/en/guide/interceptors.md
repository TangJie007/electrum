# Interceptor

Interceptors wrap Controller methods in an **onion model**: logic runs before and after `next()`, can observe input context, rewrite return values, or apply unified handling on failure before rethrowing.

They run after Guard / Pipe, outside the business method (wrapping the call).  
They **do not** handle access control ([Guard](./guards)), and **do not** specifically transform `args[0]` ([Pipe](./pipes)).

See [Middleware Pipeline](./middleware) for an overview.

## Interface

```ts
import type { NestInterceptor, IpcContext } from '@electrum/common'

intercept(context: IpcContext, next: () => Promise<any>): Promise<any>
```

You must call (or deliberately skip) `next()` to reach inner Interceptors / the business method. With multiple Interceptors, **the outermost enters first and exits last** (same as Nest).

## Mounting

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

You can also mount at method level, or use `app.useGlobalInterceptors(LoggingInterceptor)`.  
`examples/basic` uses a global `LoggingInterceptor` to print elapsed time.

Merge order: **global → class → method** (then execute onion-style from outside in).

## Use Cases

### 1. Logging and Timing

Record channel name, duration, and success/failure in one place instead of hand-rolling `console.time` in every handler.

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

### 2. Envelope / Metadata on Return Values

Without changing Controller signatures, uniformly wrap as `{ data, channel, at }`, or strip internal fields before returning to the renderer.

```ts
@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  async intercept(context: IpcContext, next: () => Promise<any>) {
    const data = await next()
    return { data, channel: context.channel, at: Date.now() }
  }
}
```

### 3. Cache Hits (Read-Only Channels)

For idempotent queries, short-lived cache by `channel + args`; skip write channels.

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

### 4. Timeout Control

When desktop IPC occasionally blocks, use `Promise.race` to cap wait time; on timeout throw a business exception and hand off to [Filter](./filters).

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

### 5. Audit: Who Called Which Sensitive Channel When

Combine `event.sender` with channel name for audit logs; keep business methods clean.

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

## Boundaries with Other Middleware

| Need | Use |
|------|----|
| Whether the call is allowed | [Guard](./guards) |
| How parameters become valid shape | [Pipe](./pipes) |
| Logging, timing, return value wrapping | **Interceptor** |
| How exceptions reach the renderer | [Filter](./filters) |

## Next Steps

→ [Filter](./filters)  
← [Pipe](./pipes) · [Middleware Pipeline](./middleware)
