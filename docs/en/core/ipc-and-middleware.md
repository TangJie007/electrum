# IPC Bridge & Middleware Pipeline

Corresponding source:

- `packages/core/src/bridge/ipc-bridge.ts`
- `packages/core/src/middleware/pipeline.ts`

## 1. IpcBridge: Metadata → ipcMain

For each scanned Controller:

```
instance = container.resolve(Controller)
prefix   = META.CONTROLLER.prefix || ''
handles  = META.IPC_HANDLE[]
ons      = META.IPC_ON[]
```

### Channel Naming

```
fullChannel = prefix ? `${prefix}:${channel}` : channel
// e.g. @Controller('file') + @IpcHandle('read') → "file:read"
```

### handle vs on

| Decorator | Electron API | Pipeline | Method arguments |
|--------|--------------|----------|----------|
| `@IpcHandle` | `ipcMain.handle` | **Full** `execute` | `(...args)`, no event |
| `@IpcOn` | `ipcMain.on` | **Guard only** `executeGuardOnly` | `(event, ...args)` |

Handles with `devOnly: true`: skipped outside dev environment.

Duplicate channels: `warn` then skip, avoiding a second `handle` crash.

`unregisterAll`: `removeHandler` + `removeAllListeners` on registered channels (for quit / shutdown).

## 2. MiddlewarePipeline: Path of One invoke

`IpcHandle` enters `execute(ctx)`:

```
try:
  runGuards
  args' = runPipes          // transform args[0] in sequence
  return runWithInterceptors(args')
catch:
  return runFilters(err)    // yields IpcErrorResponse, not an uncaught Electron error
```

### Guard

Merge order: **global → class → method**.

Any `canActivate` returns `false` → throw `ForbiddenException`.

Usage and patterns in the user guide:

- [Guard](/en/guide/guards)
- [Pipe](/en/guide/pipes)
- [Interceptor](/en/guide/interceptors)
- [Filter](/en/guide/filters)

Pipeline overview: [Middleware pipeline](/en/guide/middleware).

### Pipe

Same global → class → method order.  
**Only transforms `args[0]`** (remaining invoke arguments pass through unchanged). Design assumption: primary payload is the first invoke argument.

### Interceptor (Onion Model)

Wrap from back to front:

```
chain0 = () => controller.method(...args)
chain1 = () => interceptorN.intercept(ctx, chain0)
...
chain  = () => interceptor0.intercept(ctx, chainN-1)
return chain()
```

Same as Nest: outermost Interceptor enters first, leaves last.

### Filter

On failure, iterate **method → class → global** (opposite of Guard order—more specific first).

Each Filter `catch` should return:

```ts
{ __error: true, code: string, message: string, details?, stack? }
```

Built-in default when no Filter: `INTERNAL` / `UNKNOWN`; dev environment may include `stack`.

> Renderer Preload must recognize `__error` and re-throw; use `@electrum/preload`'s `exposeApi()` directly (see basic example).

## 3. IpcContext

Context shared across pipeline stages:

```ts
{
  channel, event, args,
  controllerClass, instance
}
```

Guards / Pipes / Interceptors / Filters decide based on it—not global variables.

## 4. Small Experiments to Understand It Yourself

1. Add `@UseGuards` to a method with `canActivate` always `false`; confirm invoke gets Forbidden.  
2. Write a Pipe that uppercases `args[0]`; confirm Controller receives the transformed value.  
3. Two Interceptors each log "enter/leave"; verify onion order.  
4. Throw a plain `Error`; compare response JSON with and without a global Filter.

Related examples:

- `examples/basic/src/main/filters/global-exception.filter.ts`
- `examples/basic/src/main/interceptors/logging.interceptor.ts`

Next: [Window / event / lifecycle](./window-event-lifecycle.md)
