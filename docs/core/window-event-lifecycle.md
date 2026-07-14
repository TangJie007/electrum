# 窗口、事件与生命周期

对应源码：

- `packages/core/src/window/manager.ts`
- `packages/core/src/bridge/event-bridge.ts`
- `packages/core/src/lifecycle/manager.ts`

## 1. WindowManager

### 声明式创建

`@Module({ declarations: [MainWindow] })` + `@WindowDeclaration({ name, ... })`。

`initialize(scannedModules)`：

1. `setWindowProvider` 挂到 DI  
2. 遍历各模块 `declarations`  
3. `autoCreate !== false` 则 `createWindow(config)`

`createWindow`：

- `new BrowserWindow(config.options)`
- 开发：优先 `ELECTRON_RENDERER_URL` 或 `config.devUrl` → `loadURL`  
- 生产：`config.prodFile` → `loadFile`  
- `ready-to-show` 后 `show`  
- `closed` 时从 Map 删除，避免持有已毁窗口

### API

| 方法 | 用途 |
|------|------|
| `getWindow(name)` | 取单个窗口，默认 name=`main` |
| `getAllWindows()` | 全部存活窗口 |
| `sendTo(name, channel, ...args)` | 定向 `webContents.send` |
| `broadcast(channel, ...args)` | 向所有未销毁窗口发送 |

跨窗口通信不经过 IpcBridge 的 Controller 元数据，是 WindowManager 的直接能力。

### 与 @WindowRef

业务侧：

```ts
@WindowRef('main')
mainWin!: BrowserWindow
```

DI 解析到 `electrum:window:main` → `getWindow('main')`。  
窗口未创建或不存在会在 resolve 时抛错——这也是为什么启动要「先窗后 IPC」。

## 2. EventBridge

扫描每个模块的 **controllers + providers**：

```
handlers = META.APP_EVENT[]   // { event, method }
instance = resolve(class)
app.on(event, (...args) => instance[method](...args))
```

- 同步异常、Promise reject 都只打 Logger，不拖垮主进程。  
- 参数原样转发 Electron `app` 事件回调（例如 `window-all-closed`）。

与 IpcBridge 的区别：事件源是 **Electron `app`**，不是渲染进程 IPC。

## 3. LifecycleManager

三个钩子名与接口方法同名：

| 钩子 | 典型用途 |
|------|----------|
| `onModuleInit` | 读配置、建连接（start 里 IPC 注册之后立刻跑） |
| `onAppReady` | 依赖「窗+IPC」已就绪的启动逻辑 |
| `onModuleDestroy` | 关资源；`before-quit` → `shutdown` |

执行规则：

1. 收集「容器里有、且实例上存在该方法」的 Controller/Provider  
2. `Promise.allSettled` **并行**调用  
3. 单个失败记 error，不阻断其它实例  

对照 Nest：`OnModuleInit` / `onApplicationBootstrap` 等，这里精简为 Electron 场景三钩子。

## 4. 和 Application.shutdown 的关系

```
before-quit
  → plugin.destroy?
  → onModuleDestroy
  → ipcBridge.unregisterAll()
```

学完建议打开示例：

- `examples/basic/src/main/window/window.module.ts`
- `examples/basic/src/main/app.controller.ts`（若有 `@AppEvent`）
- `examples/basic/src/main/file/file.service.ts`（生命周期清理）

下一篇：[类型生成与插件](./types-and-plugins.md)
