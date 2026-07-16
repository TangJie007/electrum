# 一次 invoke 怎么跑完

假设渲染进程已调用 `api.app.info()`，主进程 `ipcMain.handle('app:info')` 已注册（见 [@IpcHandle 绑定路径](./ipc-handle)）。

回调里不是直接 `instance.getInfo()`，而是：

```ts
return this.pipeline.execute({
  type: 'handle',
  instance,           // AppController 单例
  method: 'getInfo',
  controllerClass: AppController,
  channel: 'app:info',
  event: _event,
  args,
})
```

源码：`packages/core/src/middleware/pipeline.ts`。

## 执行顺序（@IpcHandle）

```
Guard（全局 → 类 → 方法）
  → 任一返回 false / 抛错 → 中止（常见 ForbiddenException）
Pipe（全局 → 类 → 方法）
  → 依次变换 args[0]（第一个业务参数）
Interceptor（全局 → 类 → 方法，洋葱模型）
  → 最内层调用 Controller 方法
Controller：instance[method](...args)
  → 正常：返回值交给 invoke
  → 抛错：Filter（方法 → 类 → 全局）→ 打成 { __error, code, message }
```

`examples/basic` 在 `index.ts` 挂了全局：

```ts
app.useGlobalInterceptors(LoggingInterceptor)
app.useGlobalFilters(GlobalExceptionFilter)
```

`FileController` 还在类上 `@UseInterceptors(LoggingInterceptor)`，会叠在全局之后、方法之前（按 pipeline 合并规则）。

## @IpcOn 更短

```ts
pipeline.executeGuardOnly(...)  // 只跑 Guard，再调方法
```

无返回值；错误打日志，不走 Filter 的 IPC 错误包。

## 错误如何回到渲染进程

1. Filter 返回 / 包装为 `{ __error: true, code, message, ... }`
2. `ipcMain.handle` 把该对象当「成功返回值」传回（约定载荷）
3. preload `exposeApi` 的 `invoke` 检测到 `__error` → 抛 `IpcError`
4. 渲染 `try/catch` 或 Promise reject

## 小结

绑定只解决「谁监听哪个 channel」；  
**每一次** invoke 的横切逻辑都在 `MiddlewarePipeline`。  
主→渲染主动推送见 [@IpcEmit 推送路径](./ipc-emit)。
