---
description: Electrum monorepo 的 packages/ 目录结构约束 —— 六个包的职责、文件层级、单文件职责与 A-E 重要性分级
globs: packages/**/*.ts,packages/**/*.mts,packages/**/*.js,packages/**/package.json,packages/**/tsconfig.json,packages/**/tsup.config.ts,packages/**/vitest.config.ts
alwaysApply: false
---

# 约束一：`packages/` 包结构与文件重要性

> 适用范围：`packages/**`。
> 修改该目录下任何文件前，先确认目标文件在本规则中的**等级**；A/B 级文件的改动必须评估下游影响。

---

## 0. 全景：六个包的定位

Electrum 是「基于 TypeScript 5 Stage 3 原生装饰器的 Electron 主进程 MVC 框架」。`packages/` 下六个包按**进程边界**与**生命周期阶段**切分：

| 包 | npm 名 | 一句话职责 | 运行位置 | 运行时依赖 |
|---|---|---|---|---|
| `common` | `@electrum/common` | **声明层**：装饰器、接口、异常、Logger。把元数据写进 `Symbol.metadata` | 主进程 | **零**（peerDeps 仅 typescript） |
| `core` | `@electrum/core` | **执行层**：DI 容器、模块扫描、IPC/Event/Window 桥接、应用启动编排 | 主进程 | `@electrum/common` |
| `preload` | `@electrum/preload` | **桥接层**：`contextBridge` 安全桥 + IPC 错误还原 | 预加载脚本 | 无（peerDeps electron） |
| `client` | `@electrum/client` | **渲染层**：渲染进程侧类型化 IPC 客户端（`api.user.list()` → `invoke('user:list')`） | 渲染进程 | 零 |
| `codegen` | `@electrum/codegen` | **构建期**：用 ts-morph 静态扫描控制器，生成 `IpcApi` 声明与 preload 脚本 | Node CLI | `ts-morph` |
| `testing` | `@electrum/testing` | **测试期**：脱离 Electron 二进制的 `mockElectron()` 与轻量 DI `TestContainer` | 测试环境 | `@electrum/common` + `@electrum/core` |

### 依赖方向（单向，禁止反向）

```
        common  ←  core  ←  testing
          ↑                    ↑
          └────────────────────┘

   preload      client       codegen      （三者互不依赖，零 workspace 依赖）
```

**红线**：`common/src/**` 内禁止出现 `electron`、`@electrum/core` 或任何运行时依赖。当前已满足，不得破坏。

### 隐性耦合点（最容易漏）

- `codegen/src/build-preload.ts` 生成的模板里硬编码 `import { exposeApi } from '@electrum/preload'`。
- `client/src/create-client.ts` 的错误信息与注释中指名 `@electrum/preload`。
- `client/src/types.ts` 的 `IpcApiMap` 正是 `codegen` 产出 `IpcApi` 的对接面。

**结论**：改动 `preload` / `client` 的公共 API 名时，必须同步改 `codegen` 的生成模板。

---

## 1. `packages/common` — 声明层（零运行时依赖）

**职责**：对齐 NestJS 的 `@nestjs/common`。TS5 原生装饰器把元数据写进 `Symbol.metadata`，外加接口、异常与 Logger。`dependencies` 为空，peerDeps 只有 `typescript >=5.2`。

**入口导出**（`src/index.ts`）：`META`、`readMetadata`/`getClassMetadata`/`ownMetadataArray`、11 个装饰器模块（`@Module`、`@Injectable`、`@Controller`、`@IpcHandle`/`@IpcOn`、`@Inject`/`@Optional`、`Use*` 四个中间件装饰器、`@Catch`、`@WindowDeclaration`、`@WindowRef`、`@IpcEmit`、`@AppEvent`）、4 个中间件接口、3 个生命周期接口 + `LifecycleHookName`、4 个异常类、`Logger`，`createInjectionToken()`，类型 `ModuleMetadata`/`Provider` 一族、`InjectionToken<T>`/`TypedInjectionToken<T>`。
注意 `index.ts` 首行是 `import './polyfill'`，保证 `Symbol.metadata` 在任何装饰器求值前就绪；`polyfill.ts` **只有副作用、不导出任何东西**（早期导出的 `METADATA_READY` 常量已移除，它并不表达任何状态）。

### 文件树与重要性

```
packages/common/
├─ package.json                            E  包清单（name: @electrum/common），零 dependencies
├─ tsconfig.json / tsup.config.ts / vitest.config.ts   E  构建与测试配置
├─ dist/                                   E  tsup 单入口（src/index.ts）产物，禁止手改
└─ src/
   ├─ index.ts                             A  包唯一公共入口；首行 import './polyfill' 不可删
   ├─ polyfill.ts                          A  Symbol.metadata ??= Symbol.for(...)，必须最先执行；无导出
   ├─ constants/metadata-keys.ts           A  META（含 CATCH）+ readMetadata/getClassMetadata（带 WeakMap 缓存）
   │                                          + ownMetadataArray（写时复制，避免原型链上的父类数组被子类污染）
   │                                          跨包元数据的唯一约定，11 个装饰器模块全部依赖
   ├─ decorators/module.decorator.ts       A  @Module + @Global + ModuleMetadata / Provider / ValueProvider /
   │                                          ClassProvider / FactoryProvider / InjectionToken<T> /
   │                                          TypedInjectionToken<T> / createInjectionToken<T>()
   │                                          （模块树契约；`exports` 是 Provider 可见性白名单，
   │                                          不写即私有；`global` 等价 @Global()；`scope` 三种形态都支持）
   ├─ decorators/inject.decorator.ts       B  @Inject / @Optional + InjectionPoint（被 ipc-emit、window-ref 复用）；
   │                                          数组读取走 ownMetadataArray，@Optional 替换元素而非原地改
   ├─ decorators/catch.decorator.ts        B  @Catch(...exceptions)：写入 META.CATCH，供 Filter 按异常类型分派；
   │                                          空列表 = catch-all
   ├─ decorators/injectable.decorator.ts   B  @Injectable + Scope/InjectableOptions（scope 决定 DI 缓存策略，
   │                                          `singleton | transient | request`）
   ├─ decorators/controller.decorator.ts   B  @Controller(prefix | options)，prefix 决定 IPC channel 前缀
   ├─ decorators/ipc.decorator.ts          B  @IpcHandle（invoke/handle，可返回值，走全中间件管线）
   │                                          @IpcOn（单向，只跑 Guard）
   ├─ decorators/middleware.decorator.ts   B  UseGuards/UsePipes/UseInterceptors/UseFilters
   │                                          工厂 createMiddlewareDecorator 生成，支持类级 + 方法级
   │                                          （该工厂只服务本文件的「类级 + 方法级」双形态，
   │                                          刻意不外提 —— 其它装饰器没有这种双形态）
   ├─ decorators/metadata-list.ts          C  appendMetadata()：ownMetadataArray → push → 写回，三连收口；
   │                                          6 个装饰器（ipc×2 / app-event / ipc-emit / window-ref / inject）
   │                                          共用，避免漏掉「写回」那一步；仅供 decorators/ 内部，不导出
   ├─ error/base.exception.ts              B  ElectronException 基类（toJSON → IpcErrorResponse）
   │                                          含 NotFound / Forbidden / Validation
   ├─ guards/guard.interface.ts            B  CanActivate + IpcContext
   │                                          IpcContext 被 pipes/interceptors/filters 三个接口复用
   ├─ logger/logger.ts                     C  5 级日志（debug/verbose/log/warn/error）+ 静态 setLevel
   ├─ decorators/window.decorator.ts       C  @WindowDeclaration + WindowOptions（name/options/devUrl/prodFile/autoCreate）
   ├─ decorators/window-ref.decorator.ts   C  @WindowRef(name)，写入 Symbol.for('electrum:window:*') 虚拟 token
   ├─ decorators/ipc-emit.decorator.ts     C  @IpcEmit，注入「调用即向渲染进程推送」的函数
   ├─ decorators/app-event.decorator.ts    C  @AppEvent(name)，绑定 electron app 生命周期事件
   ├─ lifecycle/interfaces.ts              D  纯类型：OnModuleInit / OnAppReady / OnModuleDestroy
   │                                          + LifecycleHookName（由三个接口的键派生）。
   │                                          **生命周期钩子的唯一契约来源**：core/src/lifecycle/manager.ts
   │                                          必须从这里取 LifecycleHookName，不得另写字符串字面量联合
   ├─ error/error-response.ts              D  纯类型：IpcErrorResponse（__error/code/message/stack/details）
   ├─ interceptors/interceptor.interface.ts D 纯类型：NestInterceptor
   ├─ pipes/pipe.interface.ts              D  纯类型：PipeTransform + PipeContext（IpcContext + index/argCount/args）
   ├─ filters/filter.interface.ts          D  纯类型：ExceptionFilter
   ├─ __tests__/logger.spec.ts             E  日志级别过滤（含 setLevel('verbose') 的语义）
   └─ __tests__/exception.spec.ts          E  异常族（name/toJSON/details 形状）
```
**等级说明**：`logger.ts` 的级别序为 `verbose < debug < log < warn < error`（数值越小越啰嗦），
`setLevel(x)` = 「只输出重要度不低于 x 的日志」，默认 `log`。改动 `shouldLog` 的序会影响
`Logger.setLevel('debug')` 能否显示桥接层注册的 channel 列表。

---

## 2. `packages/core` — 运行时引擎

**职责**：对齐 `@nestjs/core`。读取 `common` 写入的 `Symbol.metadata`，建 DI 容器、扫模块树、绑定 `ipcMain`/`app.on`/`BrowserWindow`、跑中间件链与生命周期钩子。peerDeps：`electron >=20`、`typescript >=5.2`。

**入口导出**（`src/index.ts`）：`Application`/`createApp`、`DIContainer`、`formatToken`、`ModuleRegistry`、`ModuleScanner`、`buildModuleGraph`/`toMermaid`、`IpcBridge`、`EventBridge`、`MiddlewarePipeline`、`LifecycleManager`、`WindowManager`、`Plugin`，类型 `Token`/`ProviderOptions`/`ExternalResolver`/`CircularStrategy`/`DependencyNode`/`ModuleGraph` 一族/`PipelineExecutionContext`，并 re-export 全部 common 公共 API（业务代码更推荐直接从 `@electrum/common` 导入装饰器；含 `LifecycleHookName`，不含已移除的 `METADATA_READY`）。

### 文件树与重要性

```
packages/core/
├─ package.json                            E  包清单（name: @electrum/core），peerDeps electron+typescript
├─ tsconfig.json / tsup.config.ts / vitest.config.ts   E  构建与测试配置
├─ dist/                                   E  构建产物
└─ src/
   ├─ index.ts                             A  包唯一公共入口（tsup 唯一 entry）
   ├─ application.ts                       A  Application / createApp
   │                                          start() 幂等 + 并发复用（starting Promise），失败走 rollbackStart()；
   │                                          固定 7 步编排：扫描→ready→建窗→IPC(await)→事件(await)→
   │                                          钩子→插件；shutdown 顺序：插件 destroy→container.dispose()
   │                                          （内部逆序回调 onModuleDestroy）→拆桥接→destroyAll()
   │                                          暴露 resolve/resolveAsync、getModuleGraph/printModuleGraph、
   │                                          getScannedModules（shutdown 后清空）
   ├─ di/container.ts                      A  DIContainer：register/resolve/resolveAsync、singleton 缓存、
   │                                          并发安全（同一 token 的异步构建只跑一次，transient 不参与去重；
   │                                          异步构建期间调 resolve() 直接报错）、环依赖检测与
   │                                          setCircularStrategy（类构造链与 useFactory 的 inject 链共用一条
   │                                          解析链，环必须早于 in-flight 复用判定）、覆盖注册丢弃旧 singleton、
   │                                          request 作用域(runInRequestScope*，工厂 provider 也支持
   │                                          scope:'request')、dispose 逆序销毁(onModuleDestroy/dispose/
   │                                          onDispose)、ExternalResolver 插件点、依赖图诊断、
   │                                          formatToken（模块级导出）、unwrapRequestScope（IPC 出口展开代理，
   │                                          structuredClone 不接受 Proxy）、getModuleProviders/getScope
   │                                          支持 @Inject/@WindowRef/@IpcEmit/@Optional 属性注入
   │                                          （@Optional 走 canResolve：未 register 的 Class 也算可解析）
   │                                          —— 包内被引用 9 次，是全仓最高频文件
   │                                          同步/异步两条解析路径**共用**注入分派：applyInjection 接收
   │                                          ResolveFn 参数（resolveInternal / resolveAsyncInternal），
   │                                          另有 targetClassOf / tryResolveCircular / cacheBuilt /
   │                                          disposeInstances 四个共用片段 —— 改任一处即同时影响两条路径
   ├─ di/module-registry.ts                B  ModuleRegistry：模块 imports/exports/global 关系登记 +
   │                                          canSee() 可见性判定（Nest 语义：默认私有、exports 逐层
   │                                          re-export 可写 token 或模块类、@Global 免 imports 但仍需 exports）；
   │                                          canSee 三级 Map 缓存，register()/reset() 失效；
   │                                          listModules/importsOf/exportsOf 供模块图导出
   ├─ module/scanner.ts                    A  ModuleScanner + ScannedModule
   │                                          DFS 遍历 @Module 树并边扫边注册 Provider（带 owner，被引用 6 次）；
   │                                          `{ provide, useClass }` 形态同样继承 useClass 上的 @Injectable scope；
   │                                          declaredTokens 记录每个模块声明过的 token，walk() 后跑
   │                                          validateGraph()：exports 的 token 必须由自身或 imports 子树提供、
   │                                          exports:[OtherModule] 必须真的 import
   ├─ module/graph.ts                      C  buildModuleGraph（modules/edges/providers 只读快照）+
   │                                          toMermaid（flowchart TD；实线 import、虚线 export-module）
   ├─ middleware/pipeline.ts               B  Guard → Pipe → Interceptor（洋葱模型）→ Filter
   │                                          execute / executeGuardOnly；中间件类走 resolveAsync 解析；
   │                                          预编译 PipelinePlan（version 缓存，编译失败即清缓存）；
   │                                          Pipe 逐参数执行并回写 args，context 带 index/argCount；
   │                                          Filter 按 @Catch 类型分派（未命中回落内置序列化）；
   │                                          出口 unwrapRequestScope(result)
   ├─ bridge/ipc-bridge.ts                 B  @IpcHandle → ipcMain.handle、@IpcOn → ipcMain.on
   │                                          registerAll() 为 async（resolveAsync 解析 Controller）；
   │                                          channel 去重与 unregisterAll（removeHandler + 逐个
   │                                          removeListener，绝不 removeAllListeners）；
   │                                          每次调用包一层 request 作用域
   ├─ bridge/event-bridge.ts               C  @AppEvent → app.on（ready / window-all-closed 等）；
   │                                          registerAll() 为 async，回调包一层 request 作用域，带错误兜底与卸载
   ├─ window/manager.ts                    C  @WindowDeclaration 建 BrowserWindow、devUrl/prodFile、sendTo/broadcast；
   │                                          同名窗口复用（存活则返回并 warn）、尊重 show:false、
   │                                          加载中 sendTo 排队到 did-finish-load、destroyAll()
   ├─ lifecycle/manager.ts                 C  onModuleInit / onAppReady / onModuleDestroy，串行 await + try/catch
   │                                          （单个失败只记日志）；onModuleDestroy 逆序且只处理已创建实例，
   │                                          跳过 scope === 'request' 的 Provider，同一实例钩子只跑一次。
   │                                          钩子名类型 LifecycleHook 取自 common 的 LifecycleHookName
   ├─ plugin/plugin.interface.ts           D  纯类型：Plugin（name/install/ready/destroy）
   └─ __tests__/
      ├─ helpers/scanned-module.ts         E  stubModule()：最小 ScannedModule 构造（4 个 spec 共用）
      ├─ helpers/electron-mock.ts          E  createBrowserWindowMock()：BrowserWindow 构造 mock
      │                                      （4 个 spec 共用，统一字段，含 isLoadingMainFrame）。
      │                                      vi.mock 工厂会被提升，因此只能 `await import()` 动态引入
      └─ *.spec.ts                         E  11 个单测（application / di / event-bridge / integration /
                                              lifecycle / metadata / module-graph / pipeline /
                                              runtime-hardening / scanner / window-manager）
```
**测试约定**：core 的测试**不得** import `@electrum/testing` —— testing 依赖 core，
反向引用会形成循环 workspace 依赖（违反红线 1）。core 的 electron mock 一律走
`__tests__/helpers/`，`@electrum/testing` 只服务业务方与 examples。

### core 内部引用热度（排除 `__tests__` 与 `dist`）

| 被引文件 | 次数 | 引用方 |
|---|---|---|
| `di/container.ts` | **9** | application, index, scanner, module/graph, pipeline, ipc-bridge, event-bridge, window/manager, lifecycle/manager |
| `module/scanner.ts` | **6** | application, index, window/manager, lifecycle/manager, ipc-bridge, event-bridge |
| `di/module-registry.ts` | 1 + 1 类型 | di/container（私有持有）+ module/graph（仅 `import type`）；`index.ts` 有导出，但仅供诊断/扩展，业务方只用 `@Module({ exports })` |
| `application.ts` | 2 | index.ts, plugin/plugin.interface.ts |
| `middleware/pipeline.ts` | 2 | application, ipc-bridge |
| `bridge/*`、`window/manager`、`lifecycle/manager` | 各 1 | 仅 application.ts |

---

## 3. `packages/preload` — contextBridge 安全桥

**职责**：把 `ipcRenderer.invoke` 的结果做 `__error` 还原并抛出 `IpcError`，再 `exposeInMainWorld('api', …)`。peerDeps `electron >=20`，tsup external `['electron']`。

**入口导出**（`src/index.ts`）：`exposeApi`、`IpcError`、`isIpcErrorPayload` 及类型 `ElectrumApi / ExposeApiOptions / IpcErrorPayload`。

### 文件树与重要性

```
packages/preload/
├─ package.json / tsconfig.json / tsup.config.ts / vitest.config.ts   E  配置
├─ dist/                                   E  构建产物
└─ src/
   ├─ index.ts                             A  包门面，导出 exposeApi + IpcError 一族
   ├─ expose-api.ts                        A  核心实现：invoke（错误还原）/ on（返回反注册函数）/ send
   │                                          + contextBridge.exposeInMainWorld
   ├─ ipc-error.ts                         B  IpcErrorPayload 结构 + IpcError 类 + isIpcErrorPayload 守卫
   │                                          与 @electrum/common 的异常协议对接（形状必须保持一致）
   └─ ipc-error.spec.ts                    E  测试期：守卫判定与 IpcError 字段
```

---

## 4. `packages/client` — 渲染进程类型化 IPC 客户端

**职责**：不接触 `electron`，只依赖 `window[key]` 上由 `@electrum/preload` 暴露的桥，再用双层 `Proxy` 把 `api.user.list()` 翻译成 `invoke('user:list')`。零 runtime deps、零 workspace deps。

**入口导出**（`src/index.ts`）：`createClient` + 类型 `CreateClientOptions / ElectrumBridge / ElectrumClient / IpcApiMap / NestedIpcClient`。

### 文件树与重要性

```
packages/client/
├─ package.json / tsconfig.json / tsup.config.ts / vitest.config.ts   E  配置
├─ dist/                                   E  构建产物
└─ src/
   ├─ index.ts                             A  包唯一门面，re-export createClient 与全部公共类型
   ├─ create-client.ts                     A  核心实现：getBridge() + 双层 Proxy
   │                                          （命名空间缓存 + invoke/on/send 直通）
   ├─ types.ts                             B  契约层：IpcApiMap / ElectrumBridge / NestedIpcClient
   │                                          模板字面量类型拆分 'a:b'；是 codegen 产出 IpcApi 的对接面
   └─ create-client.spec.ts                E  测试期：invoke 委托、嵌套 Proxy 映射、on/send 透传
```

---

## 5. `packages/codegen` — 构建期代码生成

**职责**：用 ts-morph 静态扫描 `@Controller` / `@IpcHandle`，生成渲染侧 `IpcApi` 声明与 preload 脚本。提供 bin `electrum-codegen`。唯一 runtime 依赖 `ts-morph`。

**入口导出**（`src/index.ts`）：`generateIpcTypes`、`buildIpcApiDeclaration`、`buildPreloadScript`、`scanIpcChannels`、`createProject` + 类型 `GenerateIpcTypesOptions / GenerateIpcTypesResult / IpcChannelSignature`。

### 文件树与重要性

```
packages/codegen/
├─ package.json                            E  包清单；deps ts-morph；bin: electrum-codegen → dist/cli.js
├─ tsconfig.json / tsup.config.ts / vitest.config.ts   E  配置（tsup 双 entry：index + cli）
├─ dist/                                   E  构建产物（含 cli.js）
└─ src/
   ├─ index.ts                             A  库门面，re-export generate.ts 全部 API
   ├─ cli.ts                               A  可执行入口（shebang + parseArgs + printUsage）
   │                                          examples 的 predev/prebuild 直接调用
   ├─ generate.ts                          A  编排层：createProject → scanIpcChannels → build* → writeFileSync
   │                                          定义 Options / Result
   ├─ ast/controller-scanner.ts            A  扫描核心：遍历 class → getControllerPrefix → 逐 method
   │                                          getIpcHandleMeta → 拼 'prefix:channel' 签名；导出 createProject
   ├─ ast/decorator-utils.ts               B  ts-morph AST 解析：@Controller(prefix | {prefix})、
   │                                          @IpcHandle(channel, { devOnly })
   ├─ ast/type-formatter.ts                B  类型展开器：别名/接口内联展开、union、boolean 折叠、
   │                                          Promise 解包、>100 字符换行。泛型别名（Result<T>）无法做
   │                                          实参代入，输出文本形态而非退化成 unknown
   ├─ banner.ts                             C  generatedBanner()：生成文件头注释，两个 build* 共用
   ├─ build-declaration.ts                 B  IpcApi 声明文本生成（--global 时追加 declare global Window.api）
   ├─ build-preload.ts                     B  preload 脚本文本生成（IPC_INVOKE_CHANNELS 白名单 + exposeApi()）
   │                                          —— 模板硬编码 '@electrum/preload'，见「隐性耦合点」
   ├─ __tests__/generate.spec.ts           E  测试期：devOnly 过滤 + 写文件断言
   └─ __tests__/fixtures/                  E  夹具
      ├─ controllers.ts                    E  UserController / FileController（含 devOnly）
      ├─ stubs.ts                          E  Controller / IpcHandle 空实现，避免依赖 @electrum/common
      ├─ user.service.ts                   E  User 接口
      └─ tsconfig.json                     E  供 createProject 使用
```

---

## 6. `packages/testing` — 测试期工具包

**职责**：提供脱离 Electron 二进制的 `mockElectron()` 与轻量 DI `TestContainer`。是六个包中**唯一同时依赖 common + core** 的包（依赖链最下游）。

**入口导出**（`src/index.ts`）：`TestContainer`、`createTestContainer`、`mockElectron`、`MockBrowserWindow`，类型 `MockElectron / MockIpcHandler / MockIpcListener / MockAppListener / MockBrowserWindowOptions`，并 re-export `@electrum/common` 的 `META / readMetadata / getClassMetadata`。

### 文件树与重要性

```
packages/testing/
├─ package.json                            E  包清单；deps: @electrum/common + @electrum/core（workspace:*）
├─ tsconfig.json / tsup.config.ts          E  配置（external: common / core / electron）
├─ vitest.config.ts                        E  测试配置，含 resolve.alias：electron → src/__mocks__/electron.ts
├─ dist/                                   E  构建产物
└─ src/
   ├─ index.ts                             A  包门面；额外 re-export common 的元数据辅助函数供装饰器断言
   ├─ mock-electron.ts                     A  核心（约 6KB）：内存版 app / ipcMain
   │                                          （invoke·emit·handleChannels 测试钩子）/ BrowserWindow / reset()
   │                                          ipcMain 必须提供 removeListener —— IpcBridge.unregisterAll()
   │                                          走这条路径（不用 removeAllListeners），缺了会让
   │                                          app.shutdown() 在测试里直接抛 TypeError
   ├─ test-container.ts                    B  对 @electrum/core 的 DIContainer 做 register/overrideProvider/
   │                                          mock/resolve/resolveAsync/has/clear 薄封装 + getContainer() 逃生口
   │                                          （overrideProvider 在 token 未注册时抛错，避免"以为覆盖其实新增"）
   ├─ __mocks__/electron.ts                E  vitest alias 目标，避免加载真 Electron
   │                                          （仅 app / ipcMain / BrowserWindow 空壳；
   │                                          成员须与 mockElectron() 的表面保持一致）
   └─ __tests__/testing.spec.ts            E  测试期：DI mock、ipcMain handle/emit、
                                              removeListener 精确卸载、BrowserWindow 实例追踪、
                                              reset、readMetadata 断言
```

---

## 7. 改动红线（必须遵守）

1. **依赖方向单向**：`common ← core ← testing`；`client` / `preload` / `codegen` 互不依赖。
   `common/src/**` 内禁止引入 `electron`、`@electrum/core` 或任何运行时依赖。
2. **A 级文件改动需全链路回归**：
   - `common/src/constants/metadata-keys.ts`（META 键集合）—— 影响 10 个装饰器模块 + core 6 个消费者 + codegen + testing。
   - `core/src/di/container.ts`（注入语义：作用域 / 可见性 / 销毁 / 环依赖策略）—— 包内被引用 9 次，
     改动需回归 `__tests__/di.spec.ts`、`scanner.spec.ts`、`runtime-hardening.spec.ts` 与 `integration.spec.ts`。
   - `common/src/polyfill.ts` 与两个 `index.ts` 的**首行 import 顺序不可动**，否则 `Symbol.metadata` 会在装饰器求值后才就绪。
3. **新增能力优先落 C/D 级**：新装饰器放 `common/src/decorators/`，对应执行逻辑放 `core/src/<domain>/`，并在两个 `index.ts` **同步导出**，否则包外无法引用。
4. **每个包只有 `src/index.ts` 一个 tsup entry**（`codegen` 额外有 `cli.ts`）。新增对外 API 必须走 `index.ts`，不要新增入口。
5. **E 级可自由重构**，但 `dist/` 由 tsup 生成，**禁止手改**。
6. **改 `preload` / `client` 公共 API 名时**，必须同步改 `codegen/src/build-preload.ts` 的生成模板。
7. **异常协议一致性**：`preload/src/ipc-error.ts` 的 `IpcErrorPayload` 形状必须与 `common/src/error/error-response.ts` 的 `IpcErrorResponse` 保持一致。
8. **桥接注册是异步的**：`IpcBridge.registerAll()` / `EventBridge.registerAll()` 返回 `Promise<void>`
   （内部走 `resolveAsync` 以支持异步 Provider）。调用方必须 `await`，否则可能出现
   「channel 尚未注册」的竞态。
9. **新增 Provider 能力时同步三处**：`common` 的元数据类型 → `core/src/di/container.ts` 的解析逻辑 →
   `rules` 本文件的文件树与「入口导出」。
10. **`register()` 覆盖已解析过的 token 会丢弃旧 singleton**：这是 `TestContainer.overrideProvider`
    生效的前提。被丢弃的实例仍留在销毁列表里，由 `dispose()` 逆序销毁，不要"顺手清理"掉。
11. **业务方只应使用 `runInRequestScopeAsync()`**：同步版 `runInRequestScope()` 不销毁请求内创建的实例，
    仅限框架内部的同步解析路径使用。桥接层（IPC / AppEvent）已自动包作用域，业务代码无需重复包。

## 8. 本规则的维护

`packages/` 下发生文件新增/删除/移动、导出面变化、依赖变化时，按 [README.md](./README.md) 的「自动更新约定」同步修订本文件，然后运行 `pnpm rules:sync`。

<!-- 本文件由 scripts/sync-rules.mjs 从 rules/ 生成，请勿直接编辑，改 rules/ 后重新运行 pnpm rules:sync -->
