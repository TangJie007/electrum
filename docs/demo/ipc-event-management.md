# IPC 事件管理

Electrum 把 Electron 的 IPC 收敛成**三类通道 + 一类应用事件**。本页讲清「事件怎么被注册、怎么被路由、怎么被卸载」。

## 1. 四类通信总览

| 类别 | 方向 | 声明方式 | Electron API | 渲染侧 | 管线 | 返回值 |
|------|------|----------|--------------|--------|------|--------|
| **请求/响应** | 渲染 → 主 → 渲染 | `@IpcHandle(channel)` | `ipcMain.handle` | `invoke` | 完整（Guard→Pipe→Interceptor→Filter） | ✅ |
| **单向消息** | 渲染 → 主 | `@IpcOn(channel)` | `ipcMain.on` | `send` | 仅 Guard | ❌ |
| **主动推送** | 主 → 渲染 | `@IpcEmit(channel)` | `webContents.send` | `on` | 无（直接调） | ❌ |
| **应用事件** | Electron → 主 | `@AppEvent(event)` | `app.on` | — | 无 | ❌ |

前三类是 IPC，第四类是 Electron 应用生命周期事件（由 `EventBridge` 而非 `IpcBridge` 接管）。

## 2. 通道命名规则

```
fullChannel = prefix ? `${prefix}:${channel}` : channel
```

| 声明 | 结果 |
|------|------|
| `@Controller('app')` + `@IpcHandle('info')` | `app:info` |
| `@Controller({ prefix: 'file' })` + `@IpcHandle('read')` | `file:read` |
| 无 `@Controller` + `@IpcHandle('ping')` | `ping` |
| `@Controller('user')` + `@IpcHandle('profile:get')` | `user:profile:get` |

**`@IpcEmit` 用同一套规则拼接**，所以推送通道和请求通道在同一命名空间下。

## 3. 注册：装饰器记账，启动才接线

### 阶段一：装饰器

```ts
@Controller('app')                      // META.CONTROLLER = { prefix: 'app', window? }
export class AppController {
  @IpcHandle('info')                    // META.IPC_HANDLE.push({ channel:'info', method:'getInfo' })
  getInfo() { ... }
}
```

此刻 **`ipcMain` 上什么都没有**。

### 阶段二：`IpcBridge.registerAll()`

源码：`packages/core/src/bridge/ipc-bridge.ts`，由 `start()` 第 4 步调用。

```
registerAll()
  └─ for module of scannedModules
       └─ for controllerClass of module.controllers
            └─ registerController(controllerClass)
                 1. instance = container.resolve(controllerClass)   ← 属性注入在此完成
                 2. prefix = readMetadata(CONTROLLER)?.prefix
                 3. handleMethods = readMetadata(IPC_HANDLE)
                 4. onMethods     = readMetadata(IPC_ON)
```

逐条处理时的三个关键判断：

```ts
// ① devOnly 过滤：非 dev 环境直接不注册
if (options?.devOnly && !process.env.NODE_ENV?.includes('dev')) continue

// ② 全局去重：跨 Controller 也不能撞名
if (this.registeredChannels.has(fullChannel)) {
  this.logger.warn(`Duplicate IPC channel: ${fullChannel}, skipping`)
  continue
}

// ③ 闭包捕获 instance / method，调用时走管线
ipcMain.handle(fullChannel, async (_event, ...args) => {
  return this.pipeline.execute({ type: 'handle', instance, method, controllerClass,
                                 channel: fullChannel, event: _event, args })
})
```

| 机制 | 作用 |
|------|------|
| `{ devOnly: true }` | 只在 dev 注册，prod 完全不挂载（不是「调用时拒绝」） |
| `registeredChannels` Set | 全局去重；同时是 `unregisterAll` 的拆除清单 |
| 闭包捕获 | Controller 是 singleton，一次 resolve 复用 |

`@IpcOn` 走同一套 `registeredChannels`，所以 **handle 与 on 不能同名**。

## 4. 为什么必须先建窗

```
start() 第 3 步：WindowManager.initialize()      ← 先
start() 第 4 步：IpcBridge.registerAll()          ← 后
```

反过来的两个后果：

- `@WindowRef('main')` 在 `resolve` 时调 `windowProvider('main')`，取不到就 `throw new Error('Window "main" not found')` → **启动直接崩**
- `@IpcEmit` 注入的闭包调 `windowSender`，若未设置则命中默认 no-op `() => undefined` → **消息静默丢弃，无任何报错**

## 5. 请求/响应链路（`@IpcHandle`）

以 `api.app.info()` 为例的完整时序：

```
① 渲染进程
   api.app.info()
     → @electrum/client 双层 Proxy：prefix='app' + method='info'
     → bridge.invoke('app:info')

② preload（@electrum/preload exposeApi）
   ipcRenderer.invoke('app:info')
     → 拿到结果后 isIpcErrorPayload(result) ? throw IpcError : return result

③ 主进程
   ipcMain.handle('app:info') 回调
     → MiddlewarePipeline.execute({ type:'handle', ... })
          ├─ Guard  （全局 → 类 → 方法）任一 false → ForbiddenException
          ├─ Pipe   （全局 → 类 → 方法）只变换 args[0]
          ├─ Interceptor（全局 → 类 → 方法）洋葱包裹
          │     └─ instance.getInfo(...args)
          └─ catch → Filter（方法 → 类 → 全局）→ IpcErrorResponse

④ 回程
   正常值 → invoke Promise resolve
   IpcErrorResponse → preload 抛 IpcError → 渲染侧 catch
```

### 渲染侧 Proxy 怎么拼出 channel

`packages/client/src/create-client.ts` 双层 Proxy + 命名空间缓存：

```ts
const client = new Proxy({ invoke, on, send }, {
  get(target, prop) {
    if (prop === 'invoke' || prop === 'on' || prop === 'send') return target[prop]
    // api.app → 命名空间 Proxy（缓存到 prefixCache）
    return new Proxy({}, {
      get(_t, method) {
        return (...args) => bridge.invoke(`${prop}:${method}`, ...args)
      },
    })
  },
})
```

所以 `api.app.info()` === `invoke('app:info')`；`api.invoke('x:y')` / `api.on(...)` / `api.send(...)` 为直通逃生口。

## 6. 单向消息链路（`@IpcOn`）

```
渲染：api.send('app:log', 'hello')
  → preload：ipcRenderer.send('app:log', 'hello')
  → 主进程：ipcMain.on('app:log', (event, ...args) => {
        void pipeline.executeGuardOnly({ type:'on', instance, method, event, args })
      })
```

`executeGuardOnly` 与 `execute` 的差异：

| | `execute`（handle） | `executeGuardOnly`（on） |
|--|---------------------|--------------------------|
| Guard | ✅ | ✅ |
| Pipe | ✅ | ❌ |
| Interceptor | ✅ | ❌ |
| 返回值 | 回传渲染进程 | 丢弃 |
| 异常 | Filter → `IpcErrorResponse` | `logger.error`，不外抛 |

**为什么 on 只跑 Guard？** `ipcMain.on` 的返回值无处可去，Pipe/Interceptor 的「变换后回传」语义不成立；异常若往外抛会变成 unhandled rejection 泄漏到 EventEmitter，所以统一吞掉并记日志。

方法签名上，`@IpcOn` 的**第一个参数是 `IpcMainEvent`**（可用 `event.reply(...)` 回消息），`@IpcHandle` 则直接是业务参数。

## 7. 主进程向渲染进程推送（`@IpcEmit`）

```ts
@Controller('file')
export class FileController {
  @IpcEmit('saved')                       // 通道 = 'file' + ':' + 'saved'
  notifySaved!: (path: string) => void    // 注入的是函数
}
```

注入发生在 `resolve` 的属性注入阶段（`container.ts`）：

```ts
} else if (injection.type === 'emit') {
  const fullChannel = prefix ? `${prefix}:${channel}` : channel
  const target = injection.emitWindow ?? controllerWindow ?? 'main'
  instance[injection.propertyKey] = (...args: any[]) => {
    this.windowSender(target, fullChannel, ...args)
  }
}
```

目标窗优先级：**`@IpcEmit` 的 `options.window`** → **`@Controller` 的 `window`** → `'main'`。
`windowSender` 由 `Application.start()` 注入：

```ts
container.setWindowSender((target, channel, ...args) => {
  if (target === 'broadcast') windowManager.broadcast(channel, ...args)
  else windowManager.sendTo(target, channel, ...args)
})
```

`'broadcast'` 是保留字，表示推给所有窗口。两者都做 `isDestroyed()` 检查，向已销毁窗口推送会被安全忽略。

渲染侧接收：

```ts
const off = api.on('file:saved', (path) => { ... })
off()   // preload 的 on 返回反注册函数
```

## 8. 应用事件（`@AppEvent`）

不是 IPC，但同一套「装饰器记账 → 启动接线」模式，由 `EventBridge` 接管。

```
registerAll()
  └─ for cls of [...module.controllers, ...module.providers]
       └─ handlers = readMetadata(APP_EVENT)
            instance = container.resolve(cls)
            app.on(event, listener)
            registeredListeners.push({ event, listener })
```

与 `IpcBridge` 的三点差异：

1. **扫描范围更广**：`controllers + providers`（IPC 只扫 controllers）
2. **双层错误兜底**：同步 `try/catch` + 异步 `Promise.catch`，都只记日志，不冒泡到 Electron
3. **卸载靠闭包引用**：`registeredListeners` 存了 listener 引用，逐个 `app.removeListener`，而不是 `removeAllListeners`（避免误删应用自己挂的监听）

## 9. 异常怎么跨进程传

```
主进程抛错 / Guard 拒绝
  ↓
MiddlewarePipeline.runFilters
  ↓
IpcErrorResponse { __error: true, code, message, stack?(dev), details? }
  ↓ 经 IPC 序列化
preload: isIpcErrorPayload(result) → throw new IpcError(code, message, details)
  ↓
渲染进程: try { await api.app.info() } catch (e) { if (e instanceof IpcError) ... }
```

关键点：`__error: true` 是**约定哨兵字段**，`preload` 靠它区分「正常返回值恰好是对象」和「错误响应」。
`stack` 只在 dev 环境带出，避免生产泄漏堆栈。

## 10. 卸载与生命周期

`before-quit` → `Application.shutdown()`（幂等）：

```
for (plugin of plugins) await plugin.destroy?.(app)   ← 按注册顺序
  ↓
runHook('onModuleDestroy')  ← 业务自己关 watcher / 断连接
  ↓
ipcBridge.unregisterAll()
  ↓
eventBridge.unregisterAll()
```

```ts
// ipc-bridge.ts —— 每个 channel 两边都卸
for (const channel of this.registeredChannels) {
  ipcMain.removeHandler(channel)        // @IpcHandle
  ipcMain.removeAllListeners(channel)   // @IpcOn
}
this.registeredChannels.clear()
```

只拆本桥接登记过的 channel，不碰应用其它地方挂的 `ipcMain` 监听。`clear()` 保证重复调用安全。

## 11. 类型安全与通道清单

`@electrum/codegen` 在构建期扫描源码，产出渲染侧 `IpcApi` 与 preload：

```bash
pnpm exec electrum-codegen \
  --tsconfig tsconfig.json \
  --output src/renderer/ipc-api.ts \
  --preload src/preload/index.ts
```

生成的 preload 里带 `IPC_INVOKE_CHANNELS` 清单：

```ts
/** Channels registered via @IpcHandle (documentation / allowlists) */
export const IPC_INVOKE_CHANNELS = ['app:info', 'file:read', ...] as const
```

> ⚠️ 这是**文档性清单**，运行时 `exposeApi()` 不校验它。要做通道白名单需自己在 preload 里包一层判断。

`devOnly` 的通道**不会**出现在生成清单里（扫描时就过滤了）。

## 12. 排查清单

| 现象 | 优先检查 |
|------|----------|
| 渲染侧调用报 `window.api is missing` | preload 没调 `exposeApi()`，或 `contextIsolation` / `preload` 路径配错 |
| `invoke` 一直 pending | channel 拼错；Controller 没进模块的 `controllers`；`@IpcHandle` 拼成了 `@IpcOn` |
| 启动报 `Window "main" not found` | `@WindowRef` 的窗名与 `@WindowDeclaration({ name })` 不一致，或窗口 `autoCreate: false` |
| 推送收不到，且不报错 | `@IpcEmit` 的 target 窗名写错；或目标窗已销毁（`isDestroyed` 被静默忽略） |
| 启动日志 `Duplicate IPC channel` | 两个 Controller 用了相同 `prefix:channel` |
| prod 里某通道不存在 | 该通道标了 `{ devOnly: true }` |
| `on` 里的异常没任何输出 | 符合预期——`executeGuardOnly` 只 `logger.error`，调高 `Logger.setLevel('debug')` 可见 |
| 自定义 Filter 没生效 | Filter 命中第一个即 return，检查是否已被更具体的（方法级）Filter 抢先 |

## 下一步

→ [@IpcHandle 绑定路径](./ipc-handle)  
→ [一次 invoke 怎么跑完](./middleware-pipeline)  
→ [@IpcEmit 推送路径](./ipc-emit)  
→ [@AppEvent 绑定路径](./app-event)  
→ [设计原则与实现原理](./design-principles)
