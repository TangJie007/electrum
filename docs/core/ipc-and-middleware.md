# IPC 桥接与中间件管道

对应源码：

- `packages/core/src/bridge/ipc-bridge.ts`
- `packages/core/src/middleware/pipeline.ts`

## 1. IpcBridge：元数据 → ipcMain

对每个扫描到的 Controller：

```
instance = container.resolve(Controller)
prefix   = META.CONTROLLER.prefix || ''
handles  = META.IPC_HANDLE[]
ons      = META.IPC_ON[]
```

### 通道命名

```
fullChannel = prefix ? `${prefix}:${channel}` : channel
// 例：@Controller('file') + @IpcHandle('read') → "file:read"
```

### handle vs on

| 装饰器 | Electron API | Pipeline | 方法参数 |
|--------|--------------|----------|----------|
| `@IpcHandle` | `ipcMain.handle` | **完整** `execute` | `(...args)`，不含 event |
| `@IpcOn` | `ipcMain.on` | **仅 Guard** `executeGuardOnly` | `(event, ...args)` |

`devOnly: true` 的 Handle：非 dev 环境直接跳过注册。

重复通道：`warn` 后 skip，避免二次 `handle` 炸掉。

`unregisterAll`：对已登记通道 `removeHandler` + `removeAllListeners`（供 reload / quit）。

## 2. MiddlewarePipeline：一次 invoke 的路径

`IpcHandle` 进入 `execute(ctx)`：

```
try:
  runGuards
  args' = runPipes          // 依次 transform args[0]
  return runWithInterceptors(args')
catch:
  return runFilters(err)    // 得到 IpcErrorResponse，而不是扔给 Electron 未捕获
```

### Guard

合并顺序：**global → class → method**。

任一 `canActivate` 返回 `false` → 抛 `ForbiddenException`。

### Pipe

同样 global → class → method。  
**只变换 `args[0]`**（多参数时后几个原样保留）。设计假设：主业务载荷放第一个 invoke 参数。

### Interceptor（洋葱模型）

从后往前包裹：

```
chain0 = () => controller.method(...args)
chain1 = () => interceptorN.intercept(ctx, chain0)
...
chain  = () => interceptor0.intercept(ctx, chainN-1)
return chain()
```

与 Nest 一致：最外层 Interceptor 最先进入、最后离开。

### Filter

失败时遍历 **method → class → global**（注意：与 Guard 顺序相反，优先更具体的）。

每个 Filter `catch` 应返回：

```ts
{ __error: true, code: string, message: string, details?, stack? }
```

无 Filter 时内置默认：`INTERNAL` / `UNKNOWN`；dev 环境可附带 `stack`。

> 渲染进程 Preload 需识别 `__error` 再 `throw`，见设计文档与 basic 示例的 preload。

## 3. IpcContext

管道各阶段共享的上下文：

```ts
{
  channel, event, args,
  controllerClass, instance
}
```

Guard / Pipe / Interceptor / Filter 都基于它决策，而不是读全局变量。

## 4. 自己动手理解的小实验

1. 给某个方法加 `@UseGuards`，`canActivate` 固定 `false`，看 invoke 是否得到 Forbidden。  
2. 写一个 Pipe 把 `args[0]` 改成大写，确认 Controller 收到变换后值。  
3. 两个 Interceptor 各打 log「enter/leave」，验证洋葱顺序。  
4. 抛普通 `Error`，对比有无全局 Filter 时响应 JSON 差异。

相关示例：

- `examples/basic/src/main/filters/global-exception.filter.ts`
- `examples/basic/src/main/interceptors/logging.interceptor.ts`

下一篇：[窗口 / 事件 / 生命周期](./window-event-lifecycle.md)
