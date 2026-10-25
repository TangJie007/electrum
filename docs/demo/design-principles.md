# 设计原则与实现原理

本页回答「**为什么这么设计**」和「**底层怎么跑**」。逐条链路的走读见本栏其它篇目，本页是总纲。

## 1. 一句话心智模型

```
装饰器（@electrum/common）只往 Symbol.metadata 记账
        ↓
createApp(RootModule).start()（@electrum/core）读账本
        ↓
DI 接线 + 绑定 BrowserWindow / ipcMain / app
        ↓
渲染进程 invoke / on 才真正打到业务方法
```

**装饰器执行完，Electron 上什么都没发生。** 一切绑定都在 `start()` 里。

## 2. 六条设计原则

| # | 原则 | 实现依据 | 反过来会怎样 |
|---|------|----------|--------------|
| 1 | **声明与执行分离** | 装饰器全在 `common`（零运行时依赖），编排全在 `core` | 装饰器直接调 `ipcMain` 就绑死 Electron，无法单测 |
| 2 | **零第三方运行时依赖** | 用 TC39 Stage 3 的 `Symbol.metadata` 代替 `reflect-metadata` | 引入 `reflect-metadata` 就要全局副作用 + `emitDecoratorMetadata` |
| 3 | **属性注入，不做构造注入** | Stage 3 无参数装饰器，无 `design:paramtypes` | 想做 ctor 注入必须退回 `experimentalDecorators` |
| 4 | **装饰器只记账，启动才接线** | `META.*` 只存数据，`IpcBridge` / `EventBridge` / `WindowManager` 才动手 | 模块加载顺序一变行为就变，且无法扫描全貌 |
| 5 | **不封装 Electron** | `BrowserWindow` / `app` / `ipcMain` 原样暴露 | 包一层就要同步跟 Electron 版本演进 |
| 6 | **约定优于配置** | channel = `prefix:channel`，参数按位置约定 | 每个方法都要写 `@Payload()` / `@Event()` |

### 2.1 为什么必须是属性注入

Stage 3 装饰器**没有参数装饰器**，TypeScript 也不再发射 `design:paramtypes`。于是：

```ts
// ❌ 做不到（拿不到构造参数类型，也没有 @Inject() 参数装饰器）
constructor(private fileService: FileService) {}

// ✅ 框架采用
@Inject(FileService)
fileService!: FileService
```

代价是字段在 `new` 之后才被赋值——**构造函数里不能访问注入字段**，要初始化请用 `onModuleInit()`。

## 3. 元数据内核

### 3.1 polyfill 必须最先跑

```ts
// packages/common/src/polyfill.ts
;(Symbol as { metadata?: symbol }).metadata ??= Symbol.for('Symbol.metadata')
```

`packages/common/src/index.ts` 第 1 行就是 `import './polyfill'`。**顺序不能动**——装饰器求值时 `context.metadata` 才会被创建，若 `Symbol.metadata` 此时还是 `undefined`，整条链路静默失效。

### 3.2 16 个元数据键

所有键用 `Symbol.for('electrum:...')`，保证跨包、跨重复加载同一身份。

| 分类 | 键 | 写入者 | 结构 |
|------|----|--------|------|
| 类级 | `MODULE` | `@Module` | `ModuleMetadata` |
| | `INJECTABLE` | `@Injectable` | `{ scope }` |
| | `CONTROLLER` | `@Controller` | `{ prefix, window }` |
| | `WINDOW_DECLARATION` | `@WindowDeclaration` | `WindowOptions` |
| 方法级 | `IPC_HANDLE` | `@IpcHandle` | `IpcHandlerEntry[]` |
| | `IPC_ON` | `@IpcOn` | `IpcHandlerEntry[]` |
| | `APP_EVENT` | `@AppEvent` | `AppEventEntry[]` |
| 字段级 | `INJECTIONS` | `@Inject` / `@WindowRef` / `@IpcEmit` | `InjectionPoint[]` |
| 中间件类级 | `CLASS_GUARDS` / `CLASS_PIPES` / `CLASS_INTERCEPTORS` / `CLASS_FILTERS` | `@Use*` | `Function[]` |
| 中间件方法级 | `METHOD_GUARDS` / `METHOD_PIPES` / `METHOD_INTERCEPTORS` / `METHOD_FILTERS` | `@Use*` | `MethodMiddlewareEntry[]` |

### 3.3 继承语义（容易踩坑）

```ts
// packages/common/src/constants/metadata-keys.ts
export function getClassMetadata(target: Function) {
  return ((target as any)[Symbol.metadata]) || {}
}
```

**没有手写 `getPrototypeOf` 循环**。继承能生效，是因为 Stage 3 规范让派生类的 metadata 对象以基类 metadata 为原型创建，普通属性读取自然沿原型链上溯。由此产生两个后果：

- ✅ 子类 Controller 能继承父类的 `@IpcHandle` / `@UseGuards`，基类复用可行
- ⚠️ `Object.keys(getClassMetadata(X))` **看不到继承来的键**，只有 `readMetadata(X, key)` 能读到

## 4. 分层与依赖方向

```
     @electrum/common   ← 零运行时依赖（peer: typescript）
            ↑
     @electrum/core     ← 唯一依赖 common；peer: electron
            ↑
     @electrum/testing  ← 依赖 common + core

  @electrum/preload   @electrum/client   @electrum/codegen   （三者互不依赖）
```

红线：`common/src/**` 内禁止出现 `electron`、`@electrum/core` 或任何运行时依赖。

## 5. DI 容器实现原理

源码：`packages/core/src/di/container.ts`

### 5.1 resolve 的查找顺序

```
resolve(token)
  1. symbol 且以 'electrum:window:' 开头 → windowProvider(name)（虚拟 token，不进 providers 表）
  2. singletons 命中                → 直接返回
  3. resolving 集合命中             → 抛「环依赖」错误（带完整链）
  4. record.useValue                → 常量/配置，无构造
  5. record.useFactory              → 先 resolve(inject[])，再调工厂
  6. record.useClass 或 token 本身是 class
       → new targetClass()
       → 读 META.INJECTIONS 逐项注入
       → scope === 'singleton' 则缓存
  7. 都没有 → 抛 No provider found
```

环依赖检测用一个 `resolving: Set<Token>`，`try/finally` 保证出栈：

```ts
this.resolving.add(token)
try { /* new + 注入 */ }
finally { this.resolving.delete(token) }
```

错误信息会打印整条链：`Circular dependency detected: A is being resolved while already in chain: [A → B → A]`。

### 5.2 四种注入点

`META.INJECTIONS` 里每个 `InjectionPoint` 有 `type`，容器按类型分派：

| type | 产生者 | 行为 |
|------|--------|------|
| `service` | `@Inject(Token)` | 递归 `resolve(token)` |
| `optional` | `@Optional() @Inject(Token)` | 先 `has(token)`，不存在则**跳过不赋值** |
| `window` | `@WindowRef(name)` | `windowProvider(name)`；取不到**抛错** |
| `emit` | `@IpcEmit(channel)` | 注入一个函数（见 [IPC 事件管理](./ipc-event-management)） |

### 5.3 作用域

默认 `singleton`（同一容器同 token 复用实例）；`@Injectable({ scope: 'transient' })` 每次 `resolve` 都新建。
注意 `transient` 实例**不进缓存**，每次解析都会重新跑一遍属性注入。

## 6. 模块扫描

源码：`packages/core/src/module/scanner.ts`

```
walk(rootModule)
  ├─ visited 去重（A imports B、B imports A 不会死递归）
  ├─ 读 META.MODULE，没有 → 抛 "is not decorated with @Module"
  ├─ 先递归 imports            ← 依赖模块的 Provider 先入容器
  ├─ 再注册本模块 providers    ← 类 / useValue / useClass / useFactory 四形态
  ├─ 注册 controllers          ← Controller 也要进容器，否则 resolve 不了
  └─ push results
```

产物 `ScannedModule[]` 是后续所有桥接的输入：`declarations` → 建窗，`controllers` → 绑 IPC，`controllers + providers` → 绑 app 事件 / 跑生命周期。

> **模块没有 Nest 式 `exports` 边界**：Provider 注册进全局容器后，任意模块都能注入。`@Module` 只负责组织 `imports` / `controllers` / `providers` / `declarations`。

## 7. 启动时序与硬约束

`packages/core/src/application.ts` 的 `start()` 固定 8 步：

```
1. ModuleScanner.scan(root)         ← 纯记账，不 new 实例
2. await app.whenReady()
3. WindowManager.initialize()       ← 建窗 + setWindowProvider
   container.setWindowSender(...)   ← 供 @IpcEmit
4. IpcBridge.registerAll()          ← resolve(Controller) + ipcMain.handle/on
5. EventBridge.registerAll()        ← @AppEvent → app.on
6. runHook('onModuleInit') → runHook('onAppReady')
7. plugin.ready?.()
8. app.on('before-quit') → shutdown
   shutdown: plugin.destroy → onModuleDestroy → ipcBridge.unregisterAll → eventBridge.unregisterAll
```

**硬约束：第 3 步必须在第 4 步之前。**

两步都不能反：
- `registerController` 里会 `container.resolve(controllerClass)`，字段上的 `@WindowRef` 取不到窗**直接抛错**
- `setWindowSender` 晚于 IpcBridge，则 `@IpcEmit` 注入的闭包调用的是默认 no-op `() => undefined`，**消息被静默丢弃，不报错**

## 8. 中间件管道

源码：`packages/core/src/middleware/pipeline.ts`

### 8.1 execute（`@IpcHandle` 走这条）

构造 `IpcContext { channel, event, args, controllerClass, instance }`，然后：

```
runGuards        → 任一返回 false → 抛 ForbiddenException
runPipes         → 只变换 args[0]（其余参数原样透传）
runWithInterceptors → 洋葱模型包裹业务方法
  catch          → runFilters → 返回 IpcErrorResponse
```

合并顺序：

| 中间件 | 顺序 |
|--------|------|
| Guard / Pipe / Interceptor | 全局 → 类级 → 方法级 |
| **Filter** | **方法级 → 类级 → 全局**（反向，越具体越优先） |

### 8.2 两个必须知道的实现细节

**① Pipe 只处理第一个参数**

```ts
let args = [...ctx.args]
for (const pipeClass of allPipes) {
  const pipe = this.container.resolve(pipeClass) as PipeTransform
  if (args.length > 0) args[0] = await pipe.transform(args[0], context)
}
```

多参数的 IPC 方法只有 `args[0]` 会被变换。

**② Filter 命中第一个即返回**

```ts
for (const filterClass of allFilters) {
  const filter = this.container.resolve(filterClass) as ExceptionFilter
  return filter.catch(exception, context)   // ← 循环体里 return
}
```

循环第一次迭代就 `return`，所以**后续 Filter 不会被执行**，也不存在「Filter 链」的降级传递。想兜底就在那一个 Filter 内部自己处理。

兜底顺序（无任何 Filter 注册时）：
`ElectronException` → `toJSON()`；普通 `Error` → `{ code: 'INTERNAL' }`；其它 → `{ code: 'UNKNOWN' }`。`stack` 仅在 `NODE_ENV` 含 `dev` 时带上。

### 8.3 executeGuardOnly（`@IpcOn` 走这条）

只跑 Guard，然后直接 `instance[method](event, ...args)`。**没有 Pipe / Interceptor / Filter**，异常只 `logger.error` 不向上抛——因为 `ipcMain.on` 的返回值无处可去，抛错会变成 unhandled rejection。

## 9. 窗口管理

源码：`packages/core/src/window/manager.ts`

```
initialize(modules)
  ├─ container.setWindowProvider(name => this.getWindow(name))   ← 供 @WindowRef
  └─ 遍历 declarations，读 META.WINDOW_DECLARATION
       autoCreate !== false → createWindow(config)

createWindow(config)
  ├─ new BrowserWindow(config.options)
  ├─ isDev = ELECTRON_RENDERER_URL || NODE_ENV 含 'dev'
  │    isDev → loadURL(ELECTRON_RENDERER_URL || devUrl)
  │             ELECTRON_OPEN_DEVTOOLS === '1' 才开 DevTools
  │    否则  → loadFile(prodFile)
  ├─ windows.set(name, win)
  ├─ once('ready-to-show') → show()          ← 避免白屏闪烁
  └─ on('closed') → windows.delete(name)     ← 关窗即出表，防泄漏
```

推送侧两个方法都做了 `isDestroyed()` 保护：

```ts
sendTo(name, channel, ...args)  // 单窗口
broadcast(channel, ...args)     // 所有窗口
```

## 10. 生命周期与关闭

`LifecycleManager.runHook()` 遍历所有 `controllers + providers`，`container.resolve` 后挑出实现该钩子的实例，用 `Promise.allSettled` 并发执行，**单个失败只记日志不中断**其余钩子。

| 钩子 | 时机 |
|------|------|
| `onModuleInit` | IPC / app 事件都绑完之后 |
| `onAppReady` | `onModuleInit` 全部完成后 |
| `onModuleDestroy` | `before-quit` → `shutdown()` |

`shutdown()` 幂等（`shuttingDown` 标志），收尾顺序保证资源不泄漏：插件 `destroy` → `onModuleDestroy` → 卸 IPC → 卸 app 事件。

## 11. 异常跨进程协议

| 环节 | 位置 | 行为 |
|------|------|------|
| 抛出 / 捕获 | `MiddlewarePipeline.runFilters` | 统一转成 `IpcErrorResponse` |
| 传输 | Electron IPC | 当作普通对象序列化 |
| 还原 | `@electrum/preload` `exposeApi.invoke` | `isIpcErrorPayload(result)` → `throw new IpcError(...)` |
| 接收 | 渲染进程 | `try/catch`，`err instanceof IpcError` |

```ts
interface IpcErrorResponse {
  __error: true
  code: string
  message: string
  stack?: string   // 仅 dev
  details?: unknown
}
```

`preload/src/ipc-error.ts` 的 `IpcErrorPayload` 与 `common/src/error/error-response.ts` 的 `IpcErrorResponse` **形状必须保持一致**，这是跨包隐性契约。

## 12. 类型从哪来

`@electrum/common` 的元数据里**没有参数/返回值类型**（Stage 3 不发射类型信息）。所以类型靠 `@electrum/codegen` 在**构建期**用 ts-morph 读源码 AST 补：

```
electrum-codegen --tsconfig ... --output src/renderer/ipc-api.ts --preload src/preload/index.ts
  → createProject（ts-morph）
  → scanIpcChannels：遍历 class → @Controller(prefix) → 各方法 @IpcHandle(channel)
  → type-formatter 把类型内联展开（别名/接口展开、Promise 解包、过长换行）
  → buildIpcApiDeclaration → IpcApi 声明
  → buildPreloadScript     → preload（含 IPC_INVOKE_CHANNELS 清单）
```

生成的 `preload` 里 `IPC_INVOKE_CHANNELS` 是**文档性清单**，运行时 `exposeApi()` 并不校验它；要限制通道需自己在 preload 加白名单逻辑。

## 13. 设计约束速查

1. 装饰器只写 metadata，不执行业务
2. 属性注入，无构造注入；**构造函数里不能访问注入字段**
3. 先 `WindowManager.initialize`，再 `IpcBridge.registerAll`
4. metadata 键用 `Symbol.for('electrum:...')`
5. channel = `prefix ? prefix + ':' + channel : channel`
6. Provider 默认 singleton
7. 元数据继承靠原型链，`Object.keys` 看不到继承项
8. Pipe 只变换 `args[0]`；Filter 命中第一个即返回

## 下一步

→ [IPC 事件管理](./ipc-event-management)  
→ [从 createApp 到 start](./create-app-start)  
→ [整体架构](../guide/architecture)
