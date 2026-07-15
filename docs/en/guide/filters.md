# Filter

Filters are responsible for **turning pipeline exceptions into structured `IpcErrorResponse`**, so uncaught errors do not bubble straight to Electron.

They run only when Guard / Pipe / Interceptor / Controller **throws**; the success path does not invoke Filters.

The renderer must detect `__error: true` and `throw` (you can use `exposeApi()` from `@electrum/preload`). See [Preload](./preload) and [Client](./client).

See [Middleware Pipeline](./middleware) for an overview.

## Interface and Response Shape

```ts
import type { ExceptionFilter, IpcContext, IpcErrorResponse } from '@electrum/common'

catch(exception: unknown, context: IpcContext): IpcErrorResponse
```

Expected return:

```ts
{
  __error: true
  code: string
  message: string
  details?: unknown
  stack?: string // usually dev only
}
```

Built-in exceptions: `ElectronException`, `NotFoundException`, `ForbiddenException`, `ValidationException` (all provide `toJSON()`).

## Mounting

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

Recommended global registration at startup (`examples/basic` does this):

```ts
app.useGlobalFilters(GlobalExceptionFilter)
```

You can also attach `@UseFilters(...)` at class or method level.  
**Execution priority is the reverse of Guard: method → class → global** (more specific handlers first); the pipeline returns on the first matching Filter.

With no Filter registered, the framework falls back to default `INTERNAL` / `UNKNOWN` responses.

## Use Cases

### 1. Global Unified Error Contract

All IPC failures become the same JSON shape; the renderer branches on `IpcError.code` for user messaging instead of string parsing.

```ts
app.useGlobalFilters(GlobalExceptionFilter)
```

### 2. Map Business Codes to Copy / Redact

In production, hide internal stacks and SQL/path details; return safe messages only. In development, keep `stack`.

```ts
@Injectable()
export class SafeExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, _ctx: IpcContext): IpcErrorResponse {
    if (exception instanceof ElectronException) {
      const json = exception.toJSON()
      if (!process.env.NODE_ENV?.includes('dev')) {
        delete json.stack
        if (json.code === 'INTERNAL') json.message = 'Internal error'
      }
      return json
    }
    return { __error: true, code: 'UNKNOWN', message: 'Unknown error' }
  }
}
```

### 3. Domain Exceptions → Stable Codes

Services throw `NotFoundException` / `ValidationException`; Filters simply `toJSON()` and pass through; Controllers stay clean.

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

### 4. Controller-Specific Filter

The file module may add `path` to `details`; other modules use the global Filter.

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

### 5. Classify Third-Party Errors

Catch Node `ENOENT`, system API errors, etc., and map to your own codes instead of exposing raw `Error.message` to the UI.

```ts
@Injectable()
export class FsExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, _ctx: IpcContext): IpcErrorResponse {
    if (exception && typeof exception === 'object' && 'code' in exception) {
      const code = String((exception as NodeJS.ErrnoException).code)
      if (code === 'ENOENT') {
        return { __error: true, code: 'NOT_FOUND', message: 'File does not exist' }
      }
      if (code === 'EACCES') {
        return { __error: true, code: 'FORBIDDEN', message: 'Permission denied' }
      }
    }
    if (exception instanceof ElectronException) return exception.toJSON()
    return { __error: true, code: 'INTERNAL', message: 'File operation failed' }
  }
}
```

## Boundaries with Other Middleware

| Need | Use |
|------|----|
| Whether the call is allowed | [Guard](./guards) |
| How parameters become valid shape | [Pipe](./pipes) |
| Logging, timing, return value wrapping | [Interceptor](./interceptors) |
| How exceptions reach the renderer | **Filter** |

## Next Steps

→ [Windows and Lifecycle](./windows-lifecycle)  
← [Interceptor](./interceptors) · [Middleware Pipeline](./middleware)
