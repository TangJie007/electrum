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
**Execution priority is the reverse of Guard: method → class → global** (more specific handlers first); the first Filter whose `@Catch()` type matches runs and returns.

With no matching Filter, the framework falls back to default `INTERNAL` / `UNKNOWN` responses.

## Declaring handled types with `@Catch()`

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
@Catch()                    // empty list = catch-all fallback
export class FallbackFilter implements ExceptionFilter {
  catch(exception: unknown, ctx: IpcContext): IpcErrorResponse {
    return { __error: true, code: 'INTERNAL', message: `[${ctx.channel}] ${String(exception)}` }
  }
}
```

| Form | Matches |
|------|---------|
| `@Catch(NotFoundException)` | `instanceof`, subclasses included |
| `@Catch(A, B)` | either type |
| `@Catch()` | catch-all |
| no `@Catch` | catch-all (backward compatible) |

Dispatch rules:

1. Candidates are ordered method → class → global; each one is checked with `instanceof` against `META.CATCH`.
2. **The first match runs and returns**; non-matching Filters are skipped, so "method-level handles `ValidationException` only + global fallback" works together.
3. If a Filter itself throws, the error is logged and matching continues; the pipeline finally falls back to built-in serialization.
4. Primitive throws (`throw 'oops'`, `null`) can only be caught by a catch-all Filter.

> Note: `@Catch` only affects the regular `@IpcHandle` pipeline. `@IpcOn` goes through `executeGuardOnly` and never runs Filters (errors are only logged).

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
