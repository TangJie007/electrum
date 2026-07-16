# 整体架构设计

本文描述 Electrum **整个 monorepo** 的包职责与运行时编排。写业务请配合 [快速开始](./getting-started)；源码走读见仓库内 `docs/core/`（不进文档站）。

## 1. 定位

Electrum 是面向 **Electron 主进程** 的 NestJS 风格 MVC 框架：

- **声明**在 `@electrum/common`（装饰器写入 `Symbol.metadata`）
- **执行**在 `@electrum/core`（扫描 → DI → 绑窗口 / IPC / 事件）
- **渲染侧**经 `@electrum/preload` + `@electrum/client` 调用主进程

不替换 Electron API，只提供组织层，让主进程可模块化、可注入、可测。

## 2. 包地图

| 包 | 职责 | 典型入口 |
|----|------|----------|
| `@electrum/common` | 装饰器、元数据键、中间件接口、异常、Logger | `Module`、`Controller`、`IpcHandle`、`Inject` |
| `@electrum/core` | 运行时编排 | `createApp`、`Application.start` |
| `@electrum/preload` | preload 安全桥 | `exposeApi()` → `window.api` |
| `@electrum/client` | 渲染侧类型化调用 | `createClient<IpcApi>()` |
| `@electrum/testing` | 单测 DI 辅助 | `createTestContainer` |
| `examples/basic` | 完整 Electron + Vue 示例 | `createApp(AppModule).start()` |
| `examples/di` | 迷你 DI 教学（无 Electron） | 手写 `register` / `resolve` |

依赖方向（单向，避免环）：

```
业务 App
  ├─ common（声明）
  ├─ core（启动，依赖 common）
  └─ 渲染进程
       ├─ preload（依赖 Electron + 错误约定）
       └─ client（依赖 window.api）
```

`@electrum/common` **零运行时依赖**；core 负责真正调用 `ipcMain` / `BrowserWindow` / `app`。

## 3. 启动时序

入口：`createApp(RootModule)` → `await app.start()`。

```
createApp(AppModule)
  │
  ├─ 1. ModuleScanner.scan(root)
  │      · DFS 遍历 @Module.imports
  │      · 注册 providers / controllers 进 DIContainer
  │      · 收集 @WindowDeclaration
  │
  ├─ 2. await electronApp.whenReady()
  │
  ├─ 3. WindowManager.initialize()
  │      · 按声明创建 BrowserWindow
  │      · setWindowProvider → @WindowRef
  │      · setWindowSender   → @IpcEmit
  │
  ├─ 4. IpcBridge.registerAll()
  │      · resolve(Controller)（属性注入就绪）
  │      · @IpcHandle → ipcMain.handle（完整中间件）
  │      · @IpcOn     → ipcMain.on（仅 Guard）
  │
  ├─ 5. EventBridge.registerAll()
  │      · @AppEvent → app.on(...)
  │
  ├─ 6. Lifecycle：onModuleInit → onAppReady
  │
  ├─ 7. plugin.ready?.()
  │
  └─ 8. before-quit → shutdown
         · plugin.destroy → onModuleDestroy → unregisterAll IPC
```

**硬约束：先窗口，再 IPC。**  
注册 IPC 时会 `resolve(Controller)`，字段上可能有 `@WindowRef` / `@IpcEmit`；窗未就绪则注入失败。

## 4. 核心运行时组件

| 组件 | 源码 | 职责 |
|------|------|------|
| `Application` | `packages/core/src/application.ts` | 编排入口；持有 DI / 管道 / 窗口 / 桥 |
| `ModuleScanner` | `module/scanner.ts` | 扫模块树，注册 Provider / Controller |
| `DIContainer` | `di/container.ts` | `register` / `resolve`；属性注入；默认 singleton |
| `IpcBridge` | `bridge/ipc-bridge.ts` | 装饰器元数据 → `ipcMain.handle` / `on` |
| `EventBridge` | `bridge/event-bridge.ts` | `@AppEvent` → `app.on` |
| `MiddlewarePipeline` | `middleware/pipeline.ts` | Guard → Pipe → Interceptor → Filter |
| `WindowManager` | `window/manager.ts` | 声明式建窗、按名取窗、推送消息 |
| `LifecycleManager` | `lifecycle/manager.ts` | `onModuleInit` / `onAppReady` / `onModuleDestroy` |
| `TypeGenerator` | `type-generator/` | 扫描通道，生成渲染侧 `IpcApi` 骨架 |

## 5. 装饰器与运行时对照

装饰器 **只写 metadata**；真正接线在 `start()`。

| 概念 | 装饰器 / API | 运行时谁消费 |
|------|--------------|--------------|
| 模块 | `@Module` | `ModuleScanner` |
| 可注入服务 | `@Injectable` | `DIContainer` |
| IPC 控制器 | `@Controller` | 拼 `prefix:channel` |
| 请求/响应 IPC | `@IpcHandle` | `IpcBridge` → `ipcMain.handle` |
| 单向收消息 | `@IpcOn` | `IpcBridge` → `ipcMain.on` |
| 主→渲染推送 | `@IpcEmit` | resolve 时注入 send 函数 |
| 应用事件 | `@AppEvent` | `EventBridge` |
| 依赖注入 | `@Inject` / `@Optional` | `DIContainer` 赋字段 |
| 取窗口 | `@WindowRef` | `WindowManager.getWindow` |
| 声明窗口 | `@WindowDeclaration` | `WindowManager.createWindow` |
| 中间件 | `@UseGuards/Pipes/Interceptors/Filters` | `MiddlewarePipeline` |

通道命名：`@Controller('app')` + `@IpcHandle('info')` → **`app:info`**。

## 6. IPC 全链路

以 `examples/basic` 的 `app:info` 为例：

```
渲染：api.app.info()
  → createClient Proxy → window.api.invoke('app:info')
  → preload：ipcRenderer.invoke('app:info')
  → 主进程：ipcMain.handle('app:info')
  → MiddlewarePipeline.execute
       Guard → Pipe → Interceptor → AppController.getInfo()
  → 返回值经 invoke Promise 回渲染
  → 若 Filter 产出 { __error }，preload 抛出 IpcError
```

主→渲染推送：

```
@Controller('file') + @IpcEmit('saved') notifySaved
  → resolve 时注入 (...args) => windowSender(target, 'file:saved', ...args)
  → WindowManager.sendTo / broadcast → webContents.send
  → 渲染：api.on('file:saved', handler)
```

## 7. 依赖注入模型

- **属性注入**（Stage 3 无构造参数注入）：`@Inject(Token) field!: Type`
- `register(token, recipe)` 只记账；`resolve(token)` 才 `new` + 填字段
- 默认 **singleton**（同一容器内同 token 多次 resolve 同一实例）
- 支持 `useClass` / `useValue` / `useFactory`，以及 `scope: 'transient'`

教学示例见 `examples/di`；正式扫描注册见 `ModuleScanner`。

## 8. 中间件管道

`@IpcHandle` 完整顺序：

```
Guard（全局 → 类 → 方法）
  → Pipe（变换 args[0]）
    → Interceptor（洋葱模型）
      → Controller 方法
        → 异常时 Filter（方法 → 类 → 全局）
```

`@IpcOn`：**仅 Guard**，然后直接调方法；无返回值。

全局挂载：`app.useGlobalGuards/Pipes/Interceptors/Filters(...)`。

## 9. 窗口与生命周期

| 能力 | 做法 |
|------|------|
| 声明窗口 | `@WindowDeclaration({ name, options, devUrl, prodFile })` + 模块 `declarations` |
| 注入窗口 | `@WindowRef('main')` |
| 模块就绪 | 实现 `onModuleInit()` |
| 应用就绪 | 实现 `onAppReady()`（IPC / 窗口已绑完） |
| 退出清理 | 实现 `onModuleDestroy()`；框架会 `unregisterAll` IPC |

## 10. 设计约束

1. 装饰器只写 metadata，不执行业务。
2. 属性注入，无 ctor 注入。
3. 先 `WindowManager.initialize`，再 `IpcBridge.registerAll`。
4. metadata 键用 `Symbol.for('electrum:...')`，跨包同一身份。
5. channel = `prefix ? prefix + ':' + channel : channel`。
6. Provider 默认 singleton。
