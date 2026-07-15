# Middleware Pipeline

`@IpcHandle` on a Controller passes through a NestJS-style pipeline before the business method runs (see [Controllers](./controllers)).

A single `@IpcHandle` call flows through:

```
Guards → Pipes → Interceptors → (business method) → Filters (only when catching errors)
```

Each role has a different responsibility, but all wire in the same way:  
`@UseGuards` / `@UsePipes` / `@UseInterceptors` / `@UseFilters`, plus `app.useGlobal*`.  
Merge order: **global → class → method** (when Filters run, more specific ones take priority—see [Filter](./filters)).

::: warning Not the same as NestJS "Middleware"
NestJS has two concepts that are easy to conflate:

| NestJS | Electrum |
|--------|----------|
| **Middleware** (`NestMiddleware` / `MiddlewareConsumer.apply()`, like Express `(req,res,next)`) | **Not implemented** |
| **Guards / Pipes / Interceptors / Exception Filters** | **Implemented**—docs collectively call these the "middleware pipeline" |

Electrum targets Electron **IPC calls**—there is no HTTP `req`/`res`, so Express-style middleware is not included; cross-cutting concerns are covered by Guard / Pipe / Interceptor / Filter.  
For "outermost preprocessing on every channel," a **global Guard or global Interceptor** approximates common Nest Middleware usage.
:::

## How to Choose

| Need | Doc |
|------|------|
| Whether this IPC call is allowed | [Guard](./guards) |
| How arguments become valid shapes | [Pipe](./pipes) |
| Logging, timing, or transforming return values around a call | [Interceptor](./interceptors) |
| How exceptions are structured back to the renderer | [Filter](./filters) |

## Global Registration

After `createApp`, before `start`:

```ts
import { createApp } from '@electrum/core'
import { AppModule } from './app.module'
import { LoggingInterceptor } from './interceptors/logging.interceptor'
import { GlobalExceptionFilter } from './filters/global-exception.filter'

const app = createApp(AppModule)
app.useGlobalInterceptors(LoggingInterceptor)
app.useGlobalFilters(GlobalExceptionFilter)
// app.useGlobalGuards(...)
// app.useGlobalPipes(...)
await app.start()
```

## `@IpcOn` Note

Event listeners run **Guards only**—not Pipe / Interceptor / Filter. See [Guard · `@IpcOn` admission](./guards#5-ipcon-subscription-access).

Implementation details in [IPC & Middleware](/en/core/ipc-and-middleware).

## Next Steps

→ [Guard](./guards) · [Pipe](./pipes) · [Interceptor](./interceptors) · [Filter](./filters)  
→ [Windows & Lifecycle](./windows-lifecycle)
