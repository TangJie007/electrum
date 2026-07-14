# Core 架构总览

## 1. 源码地图

```
packages/core/src/
├── index.ts                 # 对外导出 + re-export common
├── application.ts           # 编排入口：createApp / start / reload
├── di/container.ts          # 依赖注入容器（属性注入）
├── module/scanner.ts        # 递归扫描 @Module 树，注册 Provider
├── bridge/
│   ├── ipc-bridge.ts        # Controller → ipcMain.handle / on
│   └── event-bridge.ts      # @AppEvent → app.on
├── middleware/pipeline.ts   # Guard → Pipe → Interceptor → Filter
├── window/manager.ts        # 声明式窗口 + @WindowRef 取窗
├── lifecycle/manager.ts     # onModuleInit / onAppReady / onModuleDestroy
├── type-generator/          # 扫描通道，生成渲染侧 api.d.ts 骨架
└── plugin/                  # Plugin 接口（install / ready / destroy）
```

## 2. 分层关系

```
┌─────────────────────────────────────────────────────────┐
│  你的业务：AppModule / Controller / Service（用 common）   │
└────────────────────────────┬────────────────────────────┘
                             │ createApp(AppModule).start()
┌────────────────────────────▼────────────────────────────┐
│  Application（编排器）                                     │
│  持有：DIContainer / Pipeline / WindowManager / Bridges   │
└─┬──────────┬──────────┬──────────┬──────────┬───────────┘
  │          │          │          │          │
  ▼          ▼          ▼          ▼          ▼
 Scanner   Container  IpcBridge  WindowMgr  Lifecycle
 读模块树   resolve    绑 IPC     建窗口     调钩子
 注册 DI   属性注入   走 Pipeline
```

元数据始终来自 **类上的 `Symbol.metadata`**（由 common 装饰器写入），core 只读不写业务装饰器。

## 3. `start()` 时序（必记）

对应 `application.ts` 中 `start()`：

```
createApp(RootModule)
  │
  ├─ 1. ModuleScanner.scan(root)
  │      · 深度优先 walk imports
  │      · 注册 providers / controllers 到 DIContainer
  │
  ├─ 2. await electronApp.whenReady()
  │
  ├─ 3. WindowManager.initialize()     ← 必须在 resolve Controller 之前
  │      · 建声明式窗口
  │      · setWindowProvider → 供 @WindowRef
  │
  ├─ 4. IpcBridge.registerAll()
  │      · resolve 每个 Controller
  │      · 按 prefix + channel 绑定 ipcMain
  │
  ├─ 5. EventBridge.registerAll()
  │      · controllers + providers 上的 @AppEvent
  │
  ├─ 6. Lifecycle: onModuleInit → onAppReady
  │
  ├─ 7. plugin.ready?.()
  │
  └─ 8. before-quit → shutdown → onModuleDestroy + 卸 IPC
```

**为何先窗口再 IPC？**  
Controller 上可能有 `@WindowRef`。若先 `resolve(Controller)` 再创窗，注入会失败。所以 `WindowManager.initialize` 排在 `IpcBridge.registerAll` 之前。

## 4. Application 对外 API

| 方法 | 作用 |
|------|------|
| `createApp(root)` | 工厂，未启动 |
| `start()` | 执行上表完整编排 |
| `use(plugin)` | 立即 `install`，`ready` 在 start 末尾 |
| `useGlobalGuards/Pipes/Interceptors/Filters` | 写入 Pipeline 全局列表 |
| `resolve(token)` | 透传 DI |
| `getWindowManager()` / `getContainer()` | 拿内部组件 |
| `generateTypes(path)` | 扫通道写 `.d.ts` |
| `reload()` | HMR 用：卸 IPC、清容器、重扫重绑 |

## 5. 和 NestJS 的对应关系

| NestJS | Electrum core |
|--------|----------------|
| `NestFactory.create` | `createApp` |
| `ModulesContainer` / 扫描 | `ModuleScanner` |
| `Injector` | `DIContainer`（**属性注入**，无 ctor design:paramtypes） |
| HTTP Adapter | `IpcBridge`（绑的是 `ipcMain`） |
| 中间件 / 管道链 | `MiddlewarePipeline` |
| 应用生命周期钩子 | `LifecycleManager` |

核心差异：传输层是 **IPC 通道**，不是 HTTP；注入是 **字段装饰器 + Symbol.metadata**，不是 `reflect-metadata`。

## 6. 学习时怎么跟一笔请求

以 `file:read` 为例（见 `examples/basic`）：

1. 启动时 `ModuleScanner` 注册 `FileController` / `FileService`
2. `IpcBridge` 读到 `@Controller('file')` + `@IpcHandle('read')` → 通道 `file:read`
3. 渲染进程 `invoke('file:read', path)`
4. `ipcMain.handle` → `MiddlewarePipeline.execute`
5. Guard → Pipe(args[0]) → Interceptor 洋葱 → `FileController.read(...)`
6. Service 经 `@Inject` 已在 resolve 时注入到 Controller 字段
7. 异常被 Filter 打成 `{ __error: true, code, message }`

下一篇：[模块扫描与 DI](./di-and-modules.md)
