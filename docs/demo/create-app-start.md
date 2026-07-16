# 从 createApp 到 start

入口在 `examples/basic/src/main/index.ts`：

```ts
const app = createApp(AppModule)
app.useGlobalInterceptors(LoggingInterceptor)
app.useGlobalFilters(GlobalExceptionFilter)
await app.start()
```

`createApp` 只 `new Application(rootModule)`，**还不扫模块、不绑 IPC**。真正干活全在 `start()`。

## start() 顺序

对应 `packages/core/src/application.ts`：

```
1. ModuleScanner.scan(AppModule)     // 注册 DI，得到 scannedModules
2. await electronApp.whenReady()
3. WindowManager.initialize(...)     // 建窗；setWindowProvider / setWindowSender
4. IpcBridge.registerAll()           // resolve Controller + 绑 ipcMain
5. EventBridge.registerAll()         // @AppEvent → app.on
6. Lifecycle：onModuleInit → onAppReady
7. plugin.ready?.()
8. before-quit → shutdown（卸 IPC 等）
```

## 为何这个顺序

| 步骤 | 原因 |
|------|------|
| 先扫描再 ready | 纯 JS，不依赖 Electron 窗口 |
| 先窗口再 IPC | `resolve(Controller)` 可能要 `@WindowRef` / `@IpcEmit` |
| 后生命周期钩子 | 此时 IPC / 窗口已可用，业务可安全发消息 |

## 和后续文章的关系

- 扫描细节 → [模块扫描与注册](./module-scanner)
- `resolve` 填 `@Inject` → [@Inject 注入路径](./inject)
- `registerAll` 绑 `@IpcHandle` → [@IpcHandle 绑定路径](./ipc-handle)

## 小结

`createApp` = 拿编排器；`start` = 按固定顺序把 metadata 变成正在跑的 Electron 主进程应用。
