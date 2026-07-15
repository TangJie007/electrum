# Electron MVC 框架设计方案

> **文档版本**：v2.1.0  
> **日期**：2026-07-15  
> **状态**：设计阶段  
> **重大变更**：全面采用 TypeScript 5 原生 Stage 3 装饰器，移除 `experimentalDecorators` 和 `reflect-metadata` 依赖  
> **包体系**：对齐 NestJS 分包模型，统一使用 `@electrum/*` 作用域包名（`@electrum/common`、`@electrum/core`、`@electrum/testing` 等）

---

## 目录

- [1. 项目概述](#1-项目概述)
- [2. 设计理念](#2-设计理念)
- [3. 整体架构](#3-整体架构)
- [4. 核心模块设计](#4-核心模块设计)
  - [4.0 TS5 装饰器元数据机制](#40-ts5-装饰器元数据机制)
  - [4.1 装饰器系统](#41-装饰器系统)
  - [4.2 依赖注入容器](#42-依赖注入容器)
  - [4.3 模块系统](#43-模块系统)
  - [4.4 IPC 桥接层](#44-ipc-桥接层)
  - [4.5 生命周期管理](#45-生命周期管理)
  - [4.6 窗口管理](#46-窗口管理)
  - [4.7 事件系统](#47-事件系统)
  - [4.8 错误处理](#48-错误处理)
  - [4.9 日志系统](#49-日志系统)
- [5. 高级特性](#5-高级特性)
- [6. API 设计参考](#6-api-设计参考)
- [7. 项目结构](#7-项目结构)
  - [7.1 包划分原则（对齐 NestJS）](#71-包划分原则对齐-nestjs)
  - [7.2 Monorepo 目录结构](#72-monorepo-目录结构)
  - [7.3 包依赖关系](#73-包依赖关系)
- [8. 构建与发布](#8-构建与发布)
- [9. 测试策略](#9-测试策略)
- [10. 路线图](#10-路线图)
- [附录 A：与现有框架对比](#附录-a与现有框架对比)
- [附录 B：TS5 装饰器 vs 旧版装饰器迁移指南](#附录-bts5-装饰器-vs-旧版装饰器迁移指南)

---

## 1. 项目概述

### 1.1 背景与动机

Electron 主进程本质上是一个 Node.js 进程，但随着应用规模增长，主进程中的逻辑会变得日益复杂：窗口管理、IPC 通信、文件操作、数据库访问、自动更新、系统集成等职责交织在一起，最终演变为难以维护的"巨石"代码。

当前社区的主流做法仍是：在 `main.ts` 中手动注册大量 `ipcMain.handle`、手动管理 `BrowserWindow` 实例、用松散的函数组织业务逻辑。这种方式在中小型项目中尚可应付，但在大型桌面应用中存在以下痛点：

| 痛点 | 描述 |
|---|---|
| **逻辑耦合** | IPC 注册、业务逻辑、窗口管理混在一起，没有清晰的边界 |
| **依赖混乱** | Service 之间的依赖关系靠手动管理，容易循环引用 |
| **不可测试** | 业务逻辑与 Electron API 强耦合，无法脱离运行时做单元测试 |
| **无生命周期** | 资源初始化和清理散落在各处，容易遗漏 |
| **类型不安全** | 渲染进程通过 `ipcRenderer.invoke` 调用时，通道名和参数类型全靠人工保证 |

NestJS 在 Node.js 服务端领域已证明了 **装饰器 + DI + 模块化 + MVC** 这套范式的有效性。本框架的目标是将这套范式移植到 Electron 主进程，提供一个轻量、类型安全、可测试的 Electron 开发框架。

### 1.2 设计目标

| 目标 | 说明 |
|---|---|
| **轻量** | `@electrum/core` < 50KB（minified），公共 API 在 `@electrum/common`，**零运行时依赖** |
| **分包清晰** | 对齐 NestJS：`common`（装饰器/接口）与 `core`（运行时引擎）分离，包名统一 `@electrum/*` |
| **类型安全** | 主进程 ↔ 渲染进程通信全链路类型安全，自动生成 `.d.ts` |
| **低侵入** | 不封装 Electron API，不改变 Electron 原有心智模型，装饰器是可选的增强层 |
| **可测试** | Service 层可完全脱离 Electron 运行时进行单元测试 |
| **渐进式** | 可从单个 Controller 开始逐步引入，不需要一次性重构 |
| **开箱即用** | 内置 electron-vite 集成（`--watch`）、多窗口管理、自动更新等常用能力 |
| **TS5 原生装饰器** | 使用 TypeScript 5 Stage 3 装饰器标准，不依赖 `experimentalDecorators` 和 `reflect-metadata` |

### 1.3 与现有方案的定位

| 框架 | 定位 | 本框架的差异点 |
|---|---|---|
| **einf** | 极简装饰器框架，无 Module 系统 | 本框架有完整模块化系统 + 生命周期 |
| **noxus** | HTTP 风格路由 + Guard，偏 NestJS 全功能 | 本框架更贴近 Electron 原生 IPC 模型，不强制 HTTP 风格 |
| **@electrojs/runtime** | 完整生命周期 + 模块图 | 本框架增加了渲染进程类型安全生成与 `--watch` 开发体验 |
| **@devisfuture/electron-modular** | Provider Pattern 解耦 | 本框架增加 Guard/Interceptor/Pipe/Filter 中间件链 |

**核心差异化**：
1. **TS5 原生装饰器** — 使用 Stage 3 标准装饰器 + `Symbol.metadata`，面向未来，不依赖遗留的 `experimentalDecorators`
2. **属性注入（Field Injection）** — 利用 TS5 field decorator + `context.metadata` 实现依赖注入，无需 `reflect-metadata` 的 `design:paramtypes`
3. 渲染进程侧自动类型生成（`api.d.ts`），全链路类型安全
4. 四层中间件链（Guard → Pipe → Controller → Interceptor → Filter），与 NestJS 心智模型一致
5. 声明式多窗口管理（`@WindowDeclaration` 装饰器 + 配置驱动）
6. 开发期主进程热更新：`electron-vite dev --watch` **整进程重启**（对齐 Nest `nest start --watch`，不做进程内软重载）
7. 不封装 Electron API，原生 `BrowserWindow`/`app`/`Menu` 等照常使用

---

## 2. 设计理念

### 核心原则

```
约定优于配置  >  显式优于隐式  >  组合优于继承
```

1. **Electron First** — 框架服务于 Electron，不试图替代它。所有 Electron 原生 API 保持不变，框架只提供组织方式
2. **装饰器即声明** — 用 TS5 原生装饰器声明意图（这是 Controller、这是 IPC 处理器、这是可注入的），框架负责编排
3. **DI 是手段不是目的** — 依赖注入解决的是"谁创建谁"的问题，不为了 DI 而 DI
4. **中间件链可插拔** — Guard/Pipe/Interceptor/Filter 都是可选的，不用就不执行，零开销
5. **开发体验优先** — 类型提示、错误信息、`--watch` 整进程重启、调试工具，开发时的舒适度等同于运行时性能
6. **面向标准** — 使用 TC39 Stage 3 装饰器标准 + `Symbol.metadata`，不依赖实验性特性

### 架构哲学

```
                    ┌─────────────────────────────────────────┐
                    │            渲染进程 (Renderer)            │
                    │   window.api.file.read('/path/to')      │
                    │         ↓ ipcRenderer.invoke             │
                    └─────────────┬───────────────────────────┘
                                  │ IPC Channel
                    ┌─────────────▼───────────────────────────┐
                    │            主进程 (Main)                  │
                    │                                         │
                    │  ┌─────────────────────────────────┐    │
                    │  │         IPC Bridge              │    │
                    │  │  ipcMain.handle 自动绑定         │    │
                    │  └────────┬────────────────────────┘    │
                    │           │                              │
                    │  ┌────────▼────────────────────────┐    │
                    │  │     中间件链                     │    │
                    │  │  Guard → Pipe → Controller       │    │
                    │  │    → Interceptor → Filter        │    │
                    │  └────────┬────────────────────────┘    │
                    │           │                              │
                    │  ┌────────▼────────────────────────┐    │
                    │  │       DI Container              │    │
                    │  │  Module → Provider → Instance    │    │
                    │  │  Field Injection via Symbol.metadata│ │
                    │  └────────┬────────────────────────┘    │
                    │           │                              │
                    │  ┌────────▼────────────────────────┐    │
                    │  │     Electron Native API         │    │
                    │  │  BrowserWindow / app / Menu     │    │
                    │  └─────────────────────────────────┘    │
                    └─────────────────────────────────────────┘
```

---

## 3. 整体架构

### 分层总览

| 层 | 职责 | 核心类 |
|---|---|---|
| **装饰器层** | 在类/方法/属性上声明元数据标记 | `@Module` `@Injectable` `@Controller` `@IpcHandle` `@IpcOn` `@AppEvent` `@WindowDeclaration` `@Inject` `@WindowRef` |
| **元数据层** | 通过 `Symbol.metadata` + `context.metadata` 存储和读取装饰器信息 | TS5 原生 `DecoratorMetadata` |
| **DI 容器** | 注册、解析、实例化 Provider，属性注入，管理依赖图 | `DIContainer` |
| **模块扫描器** | 遍历模块树，收集所有 Provider 和 Controller | `ModuleScanner` |
| **IPC 桥接层** | 把 Controller 方法自动绑定到 `ipcMain.handle` / `ipcMain.on` | `IpcBridge` |
| **事件桥接层** | 把 `@AppEvent` 方法绑定到 Electron `app.on` 事件 | `EventBridge` |
| **中间件管道** | Guard → Pipe → Controller → Interceptor → Filter 执行链 | `MiddlewarePipeline` |
| **生命周期管理** | `onModuleInit` / `onModuleDestroy` / `onAppReady` 钩子 | `LifecycleManager` |
| **窗口管理** | 声明式多窗口创建、引用注入、跨窗口通信 | `WindowManager` |
| **类型生成器** | 扫描 Controller 元数据，生成渲染进程用的 `.d.ts` | `TypeGenerator` |
| **应用入口** | 串联以上所有组件，提供 `createApp().start()` | `Application` |

### 启动流程

```
createApp(AppModule)
  │
  ├─ 0. 确保 Symbol.metadata polyfill
  ├─ 1. 创建 DIContainer
  ├─ 2. ModuleScanner 扫描 AppModule 及所有 imports
  │     ├─ 读取 Class[Symbol.metadata] 获取模块元数据
  │     ├─ 收集所有 providers → 注册到 DIContainer
  │     └─ 收集所有 controllers
  ├─ 3. 等待 app.whenReady()
  ├─ 4. IpcBridge.registerAll()
  │     └─ 遍历 controllers → resolve 实例 → 读取方法元数据 → 绑定 ipcMain.handle/on
  ├─ 5. EventBridge.registerAll()
  │     └─ 遍历 controllers + providers → 读取事件元数据 → 绑定 app.on
  ├─ 6. WindowManager.initialize()
  │     └─ 读取窗口声明元数据 → 创建所有声明式窗口
  ├─ 7. LifecycleManager.runHook('onModuleInit')
  ├─ 8. LifecycleManager.runHook('onAppReady')
  └─ 9. 注册 before-quit → runHook('onModuleDestroy')
```

---

## 4. 核心模块设计

### 4.0 TS5 装饰器元数据机制

> 本节是理解整个框架的基础。TS5 Stage 3 装饰器与旧版 `experimentalDecorators` 有本质区别。

#### 4.0.1 旧方案 vs TS5 方案对比

| 维度 | 旧方案 (`experimentalDecorators`) | TS5 方案 (Stage 3) |
|---|---|---|
| **tsconfig** | `experimentalDecorators: true` + `emitDecoratorMetadata: true` | 无需特殊配置 |
| **元数据存储** | `Reflect.defineMetadata` / `Reflect.getMetadata` | `context.metadata` → `Class[Symbol.metadata]` |
| **运行时依赖** | `reflect-metadata` polyfill | **零依赖**（TS5.2+ 内置 `Symbol.metadata` 支持） |
| **参数装饰器** | ✅ 支持 `@Inject()` 等参数装饰器 | ❌ Stage 3 不包含参数装饰器 |
| **构造函数注入** | ✅ 通过 `design:paramtypes` 获取构造函数参数类型 | ❌ 无法自动获取 |
| **属性注入** | 可选 | ✅ **主要注入方式** |
| **装饰器签名** | `(target, propertyKey, descriptor) => void` | `(target, context) => target \| void` |

#### 4.0.2 核心概念：`context.metadata` 与 `Symbol.metadata`

TypeScript 5.2+ 实现了 TC39 装饰器元数据提案。每个被装饰器修饰的类都会自动获得一个 **共享元数据对象**，所有装饰器上下文（class / method / field / accessor）都指向同一个对象：

```typescript
// 所有装饰器共享同一个 context.metadata 对象
@Module({ controllers: [FooController] })  // class decorator
class Foo {
  @Inject(FooService)                      // field decorator
  fooService!: FooService

  @IpcHandle('bar')                        // method decorator
  bar() {}
}

// 装饰器执行完毕后，元数据可通过 Symbol.metadata 访问
const metadata = Foo[Symbol.metadata]
// metadata 就是所有装饰器写入的 context.metadata 对象
```

**关键特性**：
- `context.metadata` 是一个普通的 `Record<PropertyKey, unknown>` 对象
- 同一个类的所有装饰器（class/method/field/accessor）共享同一个 `context.metadata`
- 装饰器执行完毕后，该对象被存储在 `Class[Symbol.metadata]` 上
- 使用 `Symbol.for()` 创建的 key 可跨模块/跨 realm 共享

#### 4.0.3 `Symbol.metadata` Polyfill

`Symbol.metadata` 是 TC39 Stage 3 提案，部分 Node.js 版本尚未原生支持。框架入口需要确保它存在：

```typescript
// packages/common/src/polyfill.ts — 必须在所有装饰器求值之前执行（由 @electrum/common 入口 re-export）
;(Symbol as { metadata?: symbol }).metadata ??= Symbol.for('Symbol.metadata')

// 导出，确保被引用
export const METADATA_READY = true
```

#### 4.0.4 元数据 Key 定义

使用 `Symbol.for()` 创建全局唯一的 key，确保跨包 / 重复加载模块时元数据 key 一致：

```typescript
// packages/common/src/constants/metadata-keys.ts

export const META = {
  // 类级别
  MODULE: Symbol.for('electrum:module'),
  INJECTABLE: Symbol.for('electrum:injectable'),
  CONTROLLER: Symbol.for('electrum:controller'),
  WINDOW_DECLARATION: Symbol.for('electrum:window_declaration'),

  // 方法级别（存储在类元数据中）
  IPC_HANDLE: Symbol.for('electrum:ipc_handle'),
  IPC_ON: Symbol.for('electrum:ipc_on'),
  APP_EVENT: Symbol.for('electrum:app_event'),

  // 属性级别 — DI 注入点
  INJECTIONS: Symbol.for('electrum:injections'),

  // 中间件 — 类级别
  CLASS_GUARDS: Symbol.for('electrum:class_guards'),
  CLASS_PIPES: Symbol.for('electrum:class_pipes'),
  CLASS_INTERCEPTORS: Symbol.for('electrum:class_interceptors'),
  CLASS_FILTERS: Symbol.for('electrum:class_filters'),

  // 中间件 — 方法级别
  METHOD_GUARDS: Symbol.for('electrum:method_guards'),
  METHOD_PIPES: Symbol.for('electrum:method_pipes'),
  METHOD_INTERCEPTORS: Symbol.for('electrum:method_interceptors'),
  METHOD_FILTERS: Symbol.for('electrum:method_filters'),
} as const

// ====== 元数据读取工具函数 ======

/** 读取类的 Symbol.metadata */
export function getClassMetadata(target: Function): Record<PropertyKey, unknown> {
  return (target as any)[Symbol.metadata] || {}
}

/** 从类元数据中读取指定 key 的值 */
export function readMetadata<T>(target: Function, key: PropertyKey): T | undefined {
  return getClassMetadata(target)[key] as T | undefined
}
```

#### 4.0.5 注入策略：属性注入（Field Injection）

由于 Stage 3 装饰器**不支持参数装饰器**，且 TS5 原生模式**不发射 `design:paramtypes`**，框架采用 **属性注入** 替代构造函数注入：

```typescript
// ❌ 旧方案 — 构造函数注入（依赖 design:paramtypes + 参数装饰器）
@Controller('file')
export class FileController {
  constructor(
    private fileService: FileService,           // 依赖 design:paramtypes
    @WindowRef('main') private mainWindow: BrowserWindow,  // 依赖参数装饰器
    @Inject('CONFIG') private config: AppConfig,           // 依赖参数装饰器
  ) {}
}

// ✅ TS5 方案 — 属性注入（field decorator + context.metadata）
@Controller('file')
export class FileController {
  @Inject(FileService)
  fileService!: FileService

  @WindowRef('main')
  mainWindow!: BrowserWindow

  @Inject('CONFIG')
  config!: AppConfig

  @IpcHandle('read')
  async read(path: string) {
    return this.fileService.read(path)
  }
}
```

**属性注入的优势**：
- 不依赖 `design:paramtypes` 元数据
- 不需要参数装饰器
- 注入点显式可见，代码可读性更好
- 支持可选注入（`@Optional() @Inject(Token) prop?: Type`）
- 与 Angular 新版、tRPC 等现代框架趋势一致

**属性注入的流程**：
```
1. DI 容器执行 new Target()         ← 无参构造，字段为 undefined
2. 读取 Target[Symbol.metadata]     ← 获取注入点列表
3. 遍历注入点，resolve(token)       ← 递归解析依赖
4. instance[propertyKey] = resolved ← 属性赋值
```

---

### 4.1 装饰器系统

所有装饰器使用 TS5 Stage 3 标准 API，通过 `context.metadata` 写入元数据。

#### 4.1.1 类装饰器

```typescript
// src/core/decorators/module.decorator.ts

import { META } from '../constants/metadata-keys'

export interface ModuleMetadata {
  imports?: Function[]
  controllers?: Function[]
  providers?: (Function | ValueProvider | ClassProvider | FactoryProvider)[]
  /** 声明式窗口类 */
  declarations?: Function[]
}

export interface ValueProvider {
  provide: string | symbol
  useValue: any
}

export interface ClassProvider {
  provide: any
  useClass: Function
}

export interface FactoryProvider {
  provide: any
  useFactory: (...args: any[]) => any
  inject?: any[]
}

/**
 * 声明一个模块
 * @example
 * @Module({
 *   imports: [UserModule],
 *   controllers: [AppController],
 *   providers: [AppService],
 * })
 * export class AppModule {}
 */
export function Module(metadata: ModuleMetadata) {
  return (target: Function, context: ClassDecoratorContext): void => {
    context.metadata[META.MODULE] = metadata
  }
}
```

```typescript
// src/core/decorators/injectable.decorator.ts

import { META } from '../constants/metadata-keys'

export type Scope = 'singleton' | 'transient'

export interface InjectableOptions {
  scope?: Scope
}

/**
 * 标记一个类为可注入的 Provider
 * @example
 * @Injectable()
 * export class FileService {}
 *
 * @Injectable({ scope: 'transient' })
 * export class RequestContext {}
 */
export function Injectable(options: InjectableOptions = {}) {
  return (target: Function, context: ClassDecoratorContext): void => {
    context.metadata[META.INJECTABLE] = {
      isInjectable: true,
      scope: options.scope || 'singleton',
    }
  }
}
```

```typescript
// src/core/decorators/controller.decorator.ts

import { META } from '../constants/metadata-keys'

/**
 * 声明一个 IPC Controller
 * @param prefix 通道前缀，会拼接到所有 @IpcHandle/@IpcOn 方法的 channel 前
 * @example
 * @Controller('file')
 * export class FileController {}
 * // → 方法 @IpcHandle('read') 的完整通道为 'file:read'
 */
export function Controller(prefix = '') {
  return (target: Function, context: ClassDecoratorContext): void => {
    context.metadata[META.CONTROLLER] = { prefix }
  }
}
```

```typescript
// src/core/decorators/window.decorator.ts

import { META } from '../constants/metadata-keys'

export interface WindowOptions {
  name: string
  options?: Electron.BrowserWindowConstructorOptions
  devUrl?: string
  prodFile?: string
  autoCreate?: boolean
}

/**
 * 声明一个窗口配置
 * @example
 * @WindowDeclaration({
 *   name: 'main',
 *   options: { width: 1200, height: 800 },
 *   devUrl: 'http://localhost:5173',
 *   prodFile: 'dist/renderer/index.html',
 * })
 * export class MainWindow {}
 */
export function WindowDeclaration(config: WindowOptions) {
  return (target: Function, context: ClassDecoratorContext): void => {
    context.metadata[META.WINDOW_DECLARATION] = config
  }
}
```

#### 4.1.2 方法装饰器 — IPC 通信

```typescript
// src/core/decorators/ipc.decorator.ts

import { META } from '../constants/metadata-keys'

export interface IpcHandlerEntry {
  channel: string
  method: string | symbol
  options?: { devOnly?: boolean }
}

/**
 * 注册 ipcMain.handle — 渲染进程通过 invoke 调用，可获取返回值
 *
 * 方法签名约定：
 * - 参数直接对应 ipcRenderer.invoke(channel, ...args) 传入的参数
 * - 无需 @Payload() 参数装饰器，直接声明参数即可
 *
 * @example
 * @IpcHandle('file:read')
 * async read(path: string): Promise<string> {
 *   return this.fileService.read(path)
 * }
 *
 * @IpcHandle('file:write')
 * async write(data: { path: string; content: string }): Promise<void> {
 *   await this.fileService.write(data.path, data.content)
 * }
 */
export function IpcHandle(channel: string, options?: { devOnly?: boolean }) {
  return (method: Function, context: ClassMethodDecoratorContext): Function => {
    const handlers = (context.metadata[META.IPC_HANDLE] as IpcHandlerEntry[]) || []
    handlers.push({ channel, method: context.name, options })
    context.metadata[META.IPC_HANDLE] = handlers
    return method
  }
}

/**
 * 注册 ipcMain.on — 渲染进程通过 send 发送，单向通信无返回值
 *
 * 方法签名约定：
 * - 第一个参数始终为 IpcMainEvent
 * - 其余参数对应 ipcRenderer.send(channel, ...args) 传入的参数
 *
 * @example
 * @IpcOn('notification:show')
 * onShow(event: IpcMainEvent, title: string, body: string) {
 *   new Notification({ title, body }).show()
 * }
 */
export function IpcOn(channel: string) {
  return (method: Function, context: ClassMethodDecoratorContext): Function => {
    const handlers = (context.metadata[META.IPC_ON] as IpcHandlerEntry[]) || []
    handlers.push({ channel, method: context.name })
    context.metadata[META.IPC_ON] = handlers
    return method
  }
}
```

#### 4.1.3 方法装饰器 — Electron App 事件

```typescript
// src/core/decorators/app-event.decorator.ts

import { META } from '../constants/metadata-keys'

export interface AppEventEntry {
  event: string
  method: string | symbol
}

/**
 * 监听 Electron app 级事件
 *
 * 方法参数直接对应 app.on(eventName, (...args) => {}) 的回调参数
 *
 * @example
 * @AppEvent('window-all-closed')
 * onAllWindowsClosed() { app.quit() }
 *
 * @AppEvent('before-quit')
 * async onBeforeQuit(event: Event) {
 *   await this.cleanup()
 * }
 */
export function AppEvent(eventName: string) {
  return (method: Function, context: ClassMethodDecoratorContext): Function => {
    const handlers = (context.metadata[META.APP_EVENT] as AppEventEntry[]) || []
    handlers.push({ event: eventName, method: context.name })
    context.metadata[META.APP_EVENT] = handlers
    return method
  }
}
```

#### 4.1.4 属性装饰器 — 依赖注入

```typescript
// src/core/decorators/inject.decorator.ts

import { META } from '../constants/metadata-keys'

export interface InjectionPoint {
  propertyKey: string | symbol
  token: any              // Function | string | symbol
  type: 'service' | 'window' | 'optional'
  windowName?: string     // 仅 type='window' 时使用
  optional?: boolean      // 仅 type='optional' 时使用
}

/**
 * 属性注入 — 按 token 注入依赖
 *
 * TS5 方案采用属性注入（Field Injection），替代旧版的构造函数注入。
 * DI 容器在实例化后会读取元数据，递归 resolve 并赋值。
 *
 * @param token Provider 的标识（类引用 / 字符串 / Symbol）
 *
 * @example
 * // 按类型注入
 * @Inject(FileService) fileService!: FileService
 *
 * // 按 token 注入
 * @Inject('APP_CONFIG') config!: AppConfig
 *
 * // 可选注入（找不到时不报错，赋值为 undefined）
 * @Optional() @Inject('FEATURE_FLAGS') flags?: FeatureFlags
 */
export function Inject(token: any) {
  return (value: undefined, context: ClassFieldDecoratorContext): void => {
    const injections = (context.metadata[META.INJECTIONS] as InjectionPoint[]) || []
    injections.push({
      propertyKey: context.name,
      token,
      type: 'service',
    })
    context.metadata[META.INJECTIONS] = injections
    // 返回 void → 字段保持 undefined，由 DI 容器后续赋值
  }
}

/**
 * 可选注入标记 — 与 @Inject 配合使用
 * 找不到 Provider 时不报错，字段保持 undefined
 */
export function Optional() {
  return (value: undefined, context: ClassFieldDecoratorContext): void => {
    const injections = (context.metadata[META.INJECTIONS] as InjectionPoint[]) || []
    // 标记最近一个注入点为 optional
    // 由于装饰器从下往上执行，最近添加的就是当前属性
    const last = injections[injections.length - 1]
    if (last && last.propertyKey === context.name) {
      last.type = 'optional'
      last.optional = true
    }
    context.metadata[META.INJECTIONS] = injections
  }
}
```

```typescript
// src/core/decorators/window-ref.decorator.ts

import { META } from '../constants/metadata-keys'
import { InjectionPoint } from './inject.decorator'

/**
 * 注入指定名称的窗口实例
 *
 * @example
 * @WindowRef('main') mainWindow!: BrowserWindow
 * @WindowRef('settings') settingsWindow!: BrowserWindow
 */
export function WindowRef(name = 'main') {
  return (value: undefined, context: ClassFieldDecoratorContext): void => {
    const injections = (context.metadata[META.INJECTIONS] as InjectionPoint[]) || []
    injections.push({
      propertyKey: context.name,
      token: Symbol.for(`electrum:window:${name}`),
      type: 'window',
      windowName: name,
    })
    context.metadata[META.INJECTIONS] = injections
  }
}
```

#### 4.1.5 中间件装饰器

中间件装饰器同时支持类级别和方法级别，通过 `context.kind` 区分：

```typescript
// src/core/decorators/middleware.decorator.ts

import { META } from '../constants/metadata-keys'

export interface MethodMiddlewareEntry {
  method: string | symbol
  middlewares: Function[]
}

/**
 * 通用中间件装饰器工厂
 * 同时支持类装饰器和方法装饰器
 */
function createMiddlewareDecorator(classKey: symbol, methodKey: symbol) {
  return (...middlewares: Function[]) => {
    return function (
      target: Function,
      context: ClassDecoratorContext | ClassMethodDecoratorContext
    ): Function | void {
      if (context.kind === 'class') {
        // 类级别 — 存储为数组
        const existing = (context.metadata[classKey] as Function[]) || []
        context.metadata[classKey] = [...middlewares, ...existing]
      } else {
        // 方法级别 — 存储为 { method, middlewares } 数组
        const entries = (context.metadata[methodKey] as MethodMiddlewareEntry[]) || []
        const existing = entries.find(e => e.method === context.name)
        if (existing) {
          existing.middlewares = [...middlewares, ...existing.middlewares]
        } else {
          entries.push({ method: context.name, middlewares: [...middlewares] })
        }
        context.metadata[methodKey] = entries
      }
      return target
    }
  }
}

/** 在方法/类上挂载 Guard 守卫 */
export const UseGuards = createMiddlewareDecorator(META.CLASS_GUARDS, META.METHOD_GUARDS)

/** 在方法/类上挂载 Pipe 管道 */
export const UsePipes = createMiddlewareDecorator(META.CLASS_PIPES, META.METHOD_PIPES)

/** 在方法/类上挂载 Interceptor 拦截器 */
export const UseInterceptors = createMiddlewareDecorator(META.CLASS_INTERCEPTORS, META.METHOD_INTERCEPTORS)

/** 在方法/类上挂载 Filter 异常过滤器 */
export const UseFilters = createMiddlewareDecorator(META.CLASS_FILTERS, META.METHOD_FILTERS)
```

---

### 4.2 依赖注入容器

DI 容器采用 **属性注入** 模式：先无参实例化，再通过 `Symbol.metadata` 读取注入点列表并逐个赋值。

```typescript
// src/core/di/container.ts

import { META, readMetadata, getClassMetadata } from '../constants/metadata-keys'
import type { InjectionPoint } from '../decorators/inject.decorator'

type Token = Function | string | symbol

interface ProviderRecord {
  token: Token
  useClass?: Function
  useValue?: any
  useFactory?: (...args: any[]) => any
  inject?: Token[]
  scope: 'singleton' | 'transient'
}

export class DIContainer {
  private singletons = new Map<Token, any>()
  private providers = new Map<Token, ProviderRecord>()
  private resolving = new Set<Token>()
  /** 窗口实例提供器（由 WindowManager 注册） */
  private windowProvider: (name: string) => any | undefined = () => undefined

  /**
   * 注册窗口解析函数
   */
  setWindowProvider(fn: (name: string) => any | undefined): void {
    this.windowProvider = fn
  }

  register(
    token: Token,
    options: {
      useClass?: Function
      useValue?: any
      useFactory?: (...args: any[]) => any
      inject?: Token[]
      scope?: 'singleton' | 'transient'
    } = {}
  ): void {
    this.providers.set(token, {
      token,
      useClass: options.useClass,
      useValue: options.useValue,
      useFactory: options.useFactory,
      inject: options.inject,
      scope: options.scope || 'singleton',
    })
  }

  /**
   * 解析并返回实例
   */
  resolve<T>(token: Token): T {
    // 1. 窗口 token 特殊处理
    if (typeof token === 'symbol') {
      const tokenStr = token.description || ''
      if (tokenStr.startsWith('electrum:window:')) {
        const windowName = tokenStr.replace('electrum:window:', '')
        const win = this.windowProvider(windowName)
        if (!win) throw new Error(`Window "${windowName}" not found`)
        return win as T
      }
    }

    // 2. 单例缓存
    if (this.singletons.has(token)) {
      return this.singletons.get(token)
    }

    // 3. 循环依赖检测
    if (this.resolving.has(token)) {
      throw new Error(
        `Circular dependency detected: ${this.formatToken(token)} ` +
        `is being resolved while already in chain: ` +
        `[${[...this.resolving].map(t => this.formatToken(t)).join(' → ')}]`
      )
    }

    // 4. 查找 Provider
    const record = this.providers.get(token)

    // 4a. useValue
    if (record?.useValue !== undefined) {
      if (record.scope === 'singleton') this.singletons.set(token, record.useValue)
      return record.useValue
    }

    // 4b. useFactory
    if (record?.useFactory) {
      const injectTokens = record.inject || []
      const args = injectTokens.map(t => this.resolve(t))
      const instance = record.useFactory(...args)
      if (record.scope === 'singleton') this.singletons.set(token, instance)
      return instance
    }

    // 4c. useClass 或直接按类型解析
    const targetClass = record?.useClass || (typeof token === 'function' ? token : null)
    if (!targetClass) {
      throw new Error(`No provider found for token: ${this.formatToken(token)}`)
    }

    this.resolving.add(token)

    try {
      // ★ 核心：属性注入 — 先无参实例化
      const instance = new (targetClass as any)()

      // 读取 @Inject / @WindowRef 写入的注入点元数据
      const injections = readMetadata<InjectionPoint[]>(targetClass, META.INJECTIONS) || []

      // 逐个解析并赋值
      for (const injection of injections) {
        if (injection.type === 'window') {
          // 窗口注入
          const win = this.windowProvider(injection.windowName!)
          if (win) {
            instance[injection.propertyKey] = win
          } else {
            throw new Error(`Window "${injection.windowName}" not found for injection in ${targetClass.name}`)
          }
        } else if (injection.type === 'optional') {
          // 可选注入 — 找不到不报错
          if (this.has(injection.token)) {
            instance[injection.propertyKey] = this.resolve(injection.token)
          }
        } else {
          // 常规注入
          instance[injection.propertyKey] = this.resolve(injection.token)
        }
      }

      // 单例缓存
      const finalScope = record?.scope || 'singleton'
      if (finalScope === 'singleton') {
        this.singletons.set(token, instance)
      }

      return instance
    } finally {
      this.resolving.delete(token)
    }
  }

  has(token: Token): boolean {
    if (typeof token === 'symbol') {
      const desc = token.description || ''
      if (desc.startsWith('electrum:window:')) return true
    }
    return this.providers.has(token) || this.singletons.has(token)
  }

  clear(): void {
    this.singletons.clear()
    this.providers.clear()
    this.resolving.clear()
  }

  private formatToken(token: Token): string {
    if (typeof token === 'function') return token.name
    if (typeof token === 'string') return `"${token}"`
    return String(token)
  }
}
```

#### 4.2.1 作用域说明

| 作用域 | 行为 | 适用场景 |
|---|---|---|
| `singleton`（默认） | 全局唯一实例，首次 resolve 时创建并缓存 | 大多数 Service、Repository |
| `transient` | 每次 resolve 都创建新实例 | 需要独立状态的临时对象 |

#### 4.2.2 循环依赖处理

容器通过 `resolving` Set 检测循环依赖。检测到 A → B → A 时，抛出包含完整解析链的明确错误。

**解决循环依赖的推荐方式**：
1. 重构为单向依赖（最佳）
2. 使用 `useFactory` + `inject` 延迟解析
3. 使用 string/symbol token + `@Inject(token)` 打破类型级循环
4. 使用 `@Optional()` 延迟绑定

---

### 4.3 模块系统

模块扫描器遍历模块树，读取 `Symbol.metadata` 中的模块配置，注册所有 Provider。

```typescript
// src/core/module/scanner.ts

import { META, readMetadata, getClassMetadata } from '../constants/metadata-keys'
import { DIContainer } from '../di/container'
import type { ModuleMetadata } from '../decorators/module.decorator'

export interface ScannedModule {
  moduleClass: Function
  metadata: ModuleMetadata
  controllers: Function[]
  providers: Function[]
  declarations: Function[]
}

export class ModuleScanner {
  private visited = new Set<Function>()
  private results: ScannedModule[] = []

  constructor(private container: DIContainer) {}

  scan(rootModule: Function): ScannedModule[] {
    this.walk(rootModule)
    return this.results
  }

  private walk(moduleClass: Function): void {
    if (this.visited.has(moduleClass)) return
    this.visited.add(moduleClass)

    const metadata = readMetadata<ModuleMetadata>(moduleClass, META.MODULE)

    if (!metadata) {
      throw new Error(`${moduleClass.name} is not decorated with @Module`)
    }

    // 注册 providers
    const providerClasses: Function[] = []
    for (const provider of metadata.providers || []) {
      if (typeof provider === 'function') {
        // 读取 @Injectable 中的 scope 配置
        const injectableMeta = readMetadata<{ scope: 'singleton' | 'transient' }>(
          provider, META.INJECTABLE
        )
        this.container.register(provider, {
          useClass: provider,
          scope: injectableMeta?.scope,
        })
        providerClasses.push(provider)
      } else if ('useValue' in provider) {
        this.container.register(provider.provide, { useValue: provider.useValue })
      } else if ('useClass' in provider) {
        this.container.register(provider.provide, { useClass: provider.useClass })
        providerClasses.push(provider.useClass)
      } else if ('useFactory' in provider) {
        this.container.register(provider.provide, {
          useFactory: provider.useFactory,
          inject: provider.inject,
        })
      }
    }

    this.results.push({
      moduleClass,
      metadata,
      controllers: metadata.controllers || [],
      providers: providerClasses,
      declarations: metadata.declarations || [],
    })

    // 递归扫描 imports
    for (const imported of metadata.imports || []) {
      this.walk(imported)
    }
  }
}
```

#### 4.3.1 模块与 DI 可见性

Provider 注册进全局 `DIContainer` 后，任意模块均可注入（无 Nest 式 `exports` 边界）。
`@Module` 主要用于组织 `imports` / `controllers` / `providers` / `declarations`。

---

### 4.4 IPC 桥接层

IPC 桥接层从 `Symbol.metadata` 读取方法级元数据，把 Controller 方法自动绑定到 Electron IPC。

```typescript
// src/core/bridge/ipc-bridge.ts

import { ipcMain } from 'electron'
import { META, readMetadata } from '../constants/metadata-keys'
import { DIContainer } from '../di/container'
import { ScannedModule } from '../module/scanner'
import { MiddlewarePipeline } from '../middleware/pipeline'
import { Logger } from '../logger/logger'
import type { IpcHandlerEntry } from '../decorators/ipc.decorator'

export class IpcBridge {
  private logger = new Logger('IpcBridge')
  private registeredChannels = new Set<string>()

  constructor(
    private container: DIContainer,
    private scannedModules: ScannedModule[],
    private pipeline: MiddlewarePipeline
  ) {}

  registerAll(): void {
    for (const mod of this.scannedModules) {
      for (const controllerClass of mod.controllers) {
        this.registerController(controllerClass)
      }
    }
    this.logger.log(`Registered ${this.registeredChannels.size} IPC channels`)
  }

  unregisterAll(): void {
    for (const channel of this.registeredChannels) {
      ipcMain.removeHandler(channel)
      ipcMain.removeAllListeners(channel)
    }
    this.registeredChannels.clear()
  }

  private registerController(controllerClass: Function): void {
    const instance = this.container.resolve(controllerClass)

    // 读取 Controller 前缀
    const controllerMeta = readMetadata<{ prefix: string }>(controllerClass, META.CONTROLLER)
    const prefix = controllerMeta?.prefix || ''

    // 读取 @IpcHandle 方法（从类元数据）
    const handleMethods = readMetadata<IpcHandlerEntry[]>(controllerClass, META.IPC_HANDLE) || []

    for (const { channel, method, options } of handleMethods) {
      if (options?.devOnly && !process.env.NODE_ENV?.includes('dev')) continue

      const fullChannel = prefix ? `${prefix}:${channel}` : channel

      if (this.registeredChannels.has(fullChannel)) {
        this.logger.warn(`Duplicate IPC channel: ${fullChannel}, skipping`)
        continue
      }

      // @IpcHandle — invoke/handle 模式，走完整中间件链
      ipcMain.handle(fullChannel, async (_event, ...args) => {
        return this.pipeline.execute({
          type: 'handle',
          instance,
          method,
          controllerClass,
          channel: fullChannel,
          event: _event,
          args,
        })
      })

      this.registeredChannels.add(fullChannel)
    }

    // 读取 @IpcOn 方法
    const onMethods = readMetadata<IpcHandlerEntry[]>(controllerClass, META.IPC_ON) || []

    for (const { channel, method } of onMethods) {
      const fullChannel = prefix ? `${prefix}:${channel}` : channel

      if (this.registeredChannels.has(fullChannel)) {
        this.logger.warn(`Duplicate IPC channel: ${fullChannel}, skipping`)
        continue
      }

      // @IpcOn — send/on 模式，仅走 Guard
      ipcMain.on(fullChannel, (event, ...args) => {
        this.pipeline.executeGuardOnly({
          type: 'on',
          instance,
          method,
          controllerClass,
          channel: fullChannel,
          event,
          args,
        })
      })

      this.registeredChannels.add(fullChannel)
    }
  }
}
```

#### 4.4.1 通道命名规范

```
@Controller('file')       → 前缀 'file'
@IpcHandle('read')        → 完整通道 'file:read'
@IpcHandle('write')       → 完整通道 'file:write'

@Controller('user')       → 前缀 'user'
@IpcHandle('profile:get') → 完整通道 'user:profile:get'
```

#### 4.4.2 方法参数约定

TS5 方案移除了参数装饰器（`@Event()` `@Payload()`），改用**位置约定**：

| 装饰器 | 第一个参数 | 其余参数 |
|---|---|---|
| `@IpcHandle(channel)` | 直接是 `invoke(channel, ...args)` 的第一个 arg | 后续 args |
| `@IpcOn(channel)` | `IpcMainEvent` 事件对象 | `send(channel, ...args)` 的参数 |
| `@AppEvent(eventName)` | 直接是 `app.on(eventName, ...args)` 的回调参数 | 后续参数 |

```typescript
// @IpcHandle — 参数直接是 invoke 传入的值
@IpcHandle('file:read')
async read(path: string): Promise<string> { ... }

@IpcHandle('file:write')
async write(data: { path: string; content: string }): Promise<void> { ... }

// @IpcOn — 第一个参数是 IpcMainEvent
@IpcOn('file:watch')
onWatch(event: IpcMainEvent, path: string) { ... }

// @AppEvent — 参数对应 app.on 回调
@AppEvent('open-file')
onOpenFile(event: Event, path: string) { ... }
```

---

### 4.5 生命周期管理

```typescript
// src/core/lifecycle/interfaces.ts

export interface OnModuleInit {
  onModuleInit(): void | Promise<void>
}
export interface OnAppReady {
  onAppReady(): void | Promise<void>
}
export interface OnModuleDestroy {
  onModuleDestroy(): void | Promise<void>
}
```

```typescript
// src/core/lifecycle/manager.ts

import { ScannedModule } from '../module/scanner'
import { DIContainer } from '../di/container'
import { Logger } from '../logger/logger'

export class LifecycleManager {
  private logger = new Logger('Lifecycle')

  constructor(
    private container: DIContainer,
    private scannedModules: ScannedModule[]
  ) {}

  async runHook(hook: 'onModuleInit' | 'onAppReady' | 'onModuleDestroy'): Promise<void> {
    const instances: any[] = []

    for (const mod of this.scannedModules) {
      for (const cls of [...mod.controllers, ...mod.providers]) {
        if (this.container.has(cls)) {
          const instance = this.container.resolve(cls)
          if (typeof instance[hook] === 'function') {
            instances.push(instance)
          }
        }
      }
    }

    const results = await Promise.allSettled(
      instances.map(inst => Promise.resolve(inst[hook]()))
    )

    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'rejected') {
        this.logger.error(`${hook} failed for ${instances[i].constructor.name}: ${results[i].reason}`)
      }
    }
  }
}
```

#### 生命周期时序

```
app.whenReady()
  │
  ├─ IPC Bridge 注册
  ├─ Event Bridge 注册
  ├─ Window Manager 初始化
  │
  ├─ onModuleInit()    ← 所有 Provider/Controller 的初始化逻辑
  ├─ onAppReady()      ← 应用完全就绪后的逻辑
  │
  └─ ... 应用运行中 ...
       │
       └─ before-quit
           └─ onModuleDestroy()  ← 清理资源
```

---

### 4.6 窗口管理

```typescript
// src/core/window/manager.ts

import { BrowserWindow } from 'electron'
import { META, readMetadata } from '../constants/metadata-keys'
import { DIContainer } from '../di/container'
import { Logger } from '../logger/logger'
import type { WindowOptions } from '../decorators/window.decorator'
import { ScannedModule } from '../module/scanner'

export class WindowManager {
  private logger = new Logger('WindowManager')
  private windows = new Map<string, BrowserWindow>()

  constructor(private container: DIContainer) {}

  /** 从扫描结果中创建所有 autoCreate 窗口 */
  async initialize(scannedModules: ScannedModule[]): Promise<void> {
    for (const mod of scannedModules) {
      for (const declClass of mod.declarations || []) {
        const config = readMetadata<WindowOptions>(declClass, META.WINDOW_DECLARATION)
        if (!config) continue
        if (config.autoCreate !== false) {
          this.createWindow(config)
        }
      }
    }

    // 将窗口解析函数注册到 DI 容器，供 @WindowRef 使用
    this.container.setWindowProvider((name) => this.getWindow(name))
  }

  createWindow(config: WindowOptions): BrowserWindow {
    const win = new BrowserWindow(config.options || {})

    if (process.env.NODE_ENV?.includes('dev') && config.devUrl) {
      win.loadURL(config.devUrl)
      win.webContents.openDevTools()
    } else if (config.prodFile) {
      win.loadFile(config.prodFile)
    }

    this.windows.set(config.name, win)
    win.on('closed', () => { this.windows.delete(config.name) })

    this.logger.log(`Window "${config.name}" created`)
    return win
  }

  getWindow(name = 'main'): BrowserWindow | undefined {
    return this.windows.get(name)
  }

  getAllWindows(): BrowserWindow[] {
    return [...this.windows.values()]
  }

  sendTo(name: string, channel: string, ...args: any[]): void {
    const win = this.windows.get(name)
    if (win && !win.isDestroyed()) win.webContents.send(channel, ...args)
  }

  broadcast(channel: string, ...args: any[]): void {
    for (const win of this.windows.values()) {
      if (!win.isDestroyed()) win.webContents.send(channel, ...args)
    }
  }
}
```

---

### 4.7 事件系统

```typescript
// src/core/bridge/event-bridge.ts

import { app } from 'electron'
import { META, readMetadata } from '../constants/metadata-keys'
import { DIContainer } from '../di/container'
import { ScannedModule } from '../module/scanner'
import { Logger } from '../logger/logger'
import type { AppEventEntry } from '../decorators/app-event.decorator'

export class EventBridge {
  private logger = new Logger('EventBridge')

  constructor(
    private container: DIContainer,
    private scannedModules: ScannedModule[]
  ) {}

  registerAll(): void {
    for (const mod of this.scannedModules) {
      for (const cls of [...mod.controllers, ...mod.providers]) {
        this.bindEvents(cls)
      }
    }
  }

  private bindEvents(targetClass: Function): void {
    const handlers = readMetadata<AppEventEntry[]>(targetClass, META.APP_EVENT) || []
    if (handlers.length === 0) return

    const instance = this.container.resolve(targetClass)

    for (const { event, method } of handlers) {
      app.on(event as any, (...args: any[]) => {
        try {
          const result = instance[method](...args)
          if (result instanceof Promise) {
            result.catch(err =>
              this.logger.error(`AppEvent "${event}" error: ${err.message}`)
            )
          }
        } catch (err: any) {
          this.logger.error(`AppEvent "${event}" error: ${err.message}`)
        }
      })

      this.logger.debug(`Bound app.on("${event}") → ${targetClass.name}.${String(method)}`)
    }
  }
}
```

---

### 4.8 错误处理

```typescript
// src/core/error/error-response.ts

export interface IpcErrorResponse {
  __error: true
  code: string
  message: string
  stack?: string
  details?: unknown
}
```

```typescript
// src/core/error/base.exception.ts

export class ElectronException extends Error {
  constructor(
    message: string,
    public code: string = 'INTERNAL',
    public statusCode: number = 500,
    public details?: unknown
  ) {
    super(message)
    this.name = this.constructor.name
  }

  toJSON(): IpcErrorResponse {
    return {
      __error: true,
      code: this.code,
      message: this.message,
      details: this.details,
      ...(process.env.NODE_ENV?.includes('dev') ? { stack: this.stack } : {}),
    }
  }
}

export class NotFoundException extends ElectronException {
  constructor(resource: string) {
    super(`${resource} not found`, 'NOT_FOUND', 404)
  }
}

export class ForbiddenException extends ElectronException {
  constructor(message = 'Access forbidden') {
    super(message, 'FORBIDDEN', 403)
  }
}

export class ValidationException extends ElectronException {
  constructor(message: string, public errors: unknown[]) {
    super(message, 'VALIDATION_ERROR', 422, errors)
  }
}
```

---

### 4.9 日志系统

```typescript
// src/core/logger/logger.ts

export type LogLevel = 'debug' | 'log' | 'warn' | 'error' | 'verbose'

export class Logger {
  private static globalLevel: LogLevel = 'log'

  constructor(private context: string) {}

  static setLevel(level: LogLevel): void {
    Logger.globalLevel = level
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog('debug')) console.debug(`[${this.context}] ${message}`, ...args)
  }

  log(message: string, ...args: any[]): void {
    if (this.shouldLog('log')) console.log(`[${this.context}] ${message}`, ...args)
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog('warn')) console.warn(`[${this.context}] ${message}`, ...args)
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog('error')) console.error(`[${this.context}] ${message}`, ...args)
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      debug: 0, verbose: 1, log: 2, warn: 3, error: 4,
    }
    return levels[level] >= levels[Logger.globalLevel]
  }
}
```

---

## 5. 高级特性

### 5.1 Guard 守卫

```typescript
// src/core/guards/guard.interface.ts

export interface IpcContext {
  channel: string
  event: IpcMainInvokeEvent | IpcMainEvent
  args: any[]
  controllerClass: Function
  instance: any
}

export interface CanActivate {
  canActivate(context: IpcContext): boolean | Promise<boolean>
}
```

```typescript
// 用户侧示例
@Injectable()
export class AuthGuard implements CanActivate {
  @Inject(AuthService) authService!: AuthService

  async canActivate(context: IpcContext): Promise<boolean> {
    return this.authService.verifySender(context.event.sender)
  }
}

@Controller('admin')
@UseGuards(AuthGuard)
export class AdminController {
  @IpcHandle('users:list')
  listUsers() { ... }
}
```

### 5.2 Interceptor 拦截器

```typescript
// src/core/interceptors/interceptor.interface.ts

export interface NestInterceptor {
  intercept(context: IpcContext, next: () => Promise<any>): Promise<any>
}
```

```typescript
// 用户侧示例
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  async intercept(context: IpcContext, next: () => Promise<any>) {
    const start = Date.now()
    const result = await next()
    console.log(`[${context.channel}] ${Date.now() - start}ms`)
    return result
  }
}

@Controller('file')
@UseInterceptors(LoggingInterceptor)
export class FileController {
  @IpcHandle('read')
  readFile(path: string) { ... }
}
```

### 5.3 Pipe 管道

```typescript
// src/core/pipes/pipe.interface.ts

export interface PipeTransform {
  transform(value: any, context: IpcContext): any | Promise<any>
}
```

```typescript
// 用户侧示例
@Injectable()
export class ValidationPipe implements PipeTransform {
  transform(value: any, context: IpcContext) {
    if (value === undefined || value === null) {
      throw new ValidationException(`${context.channel}: payload is required`, [])
    }
    return value
  }
}
```

### 5.4 Filter 异常过滤器

```typescript
// src/core/filters/filter.interface.ts

export interface ExceptionFilter {
  catch(exception: unknown, context: IpcContext): IpcErrorResponse
}
```

```typescript
// 用户侧示例
@Injectable()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, context: IpcContext): IpcErrorResponse {
    if (exception instanceof ElectronException) return exception.toJSON()
    if (exception instanceof Error) {
      return {
        __error: true,
        code: 'INTERNAL',
        message: exception.message,
        ...(process.env.NODE_ENV?.includes('dev') ? { stack: exception.stack } : {}),
      }
    }
    return { __error: true, code: 'UNKNOWN', message: 'An unknown error occurred' }
  }
}
```

### 5.4.1 中间件执行链

```
渲染进程 invoke('file:read', '/path')
  │
  ▼
┌──────────────────────────────────────────────┐
│  1. Guard 链                                  │
│     AuthGuard.canActivate() → true/false      │
│     如果 false → 直接返回 Forbidden 错误       │
├──────────────────────────────────────────────┤
│  2. Pipe 链                                   │
│     ValidationPipe.transform(payload)         │
│     转换/校验后的参数传递给 Controller         │
├──────────────────────────────────────────────┤
│  3. Interceptor 前置                          │
│     LoggingInterceptor.intercept(             │
│       context, next: () => controller.read()  │
│     )                                         │
├──────────────────────────────────────────────┤
│  4. Controller 方法执行                        │
│     instance.read('/path')                    │
├──────────────────────────────────────────────┤
│  5. Interceptor 后置（响应转换）               │
├──────────────────────────────────────────────┤
│  6. 返回结果给渲染进程                         │
│     或 Filter 捕获异常 → IpcErrorResponse      │
└──────────────────────────────────────────────┘
```

### 5.4.2 中间件管道实现

```typescript
// src/core/middleware/pipeline.ts

import { META, readMetadata } from '../constants/metadata-keys'
import { DIContainer } from '../di/container'
import type { CanActivate, IpcContext } from '../guards/guard.interface'
import type { NestInterceptor } from '../interceptors/interceptor.interface'
import type { PipeTransform } from '../pipes/pipe.interface'
import type { ExceptionFilter } from '../filters/filter.interface'
import type { IpcErrorResponse } from '../error/error-response'
import type { MethodMiddlewareEntry } from '../decorators/middleware.decorator'
import { Logger } from '../logger/logger'
import { ForbiddenException } from '../error/base.exception'

export interface PipelineExecutionContext {
  type: 'handle' | 'on'
  instance: any
  method: string | symbol
  controllerClass: Function
  channel: string
  event: any
  args: any[]
}

export class MiddlewarePipeline {
  private logger = new Logger('Pipeline')
  private globalFilters: Function[] = []
  private globalGuards: Function[] = []
  private globalPipes: Function[] = []
  private globalInterceptors: Function[] = []

  constructor(private container: DIContainer) {}

  useGlobalFilters(...filters: Function[]): void { this.globalFilters.push(...filters) }
  useGlobalGuards(...guards: Function[]): void { this.globalGuards.push(...guards) }
  useGlobalPipes(...pipes: Function[]): void { this.globalPipes.push(...pipes) }
  useGlobalInterceptors(...interceptors: Function[]): void { this.globalInterceptors.push(...interceptors) }

  async execute(ctx: PipelineExecutionContext): Promise<any> {
    const context: IpcContext = {
      channel: ctx.channel,
      event: ctx.event,
      args: ctx.args,
      controllerClass: ctx.controllerClass,
      instance: ctx.instance,
    }

    try {
      await this.runGuards(ctx, context)
      const transformedArgs = await this.runPipes(ctx, context)
      return await this.runWithInterceptors(ctx, context, transformedArgs)
    } catch (err) {
      return this.runFilters(err, context)
    }
  }

  async executeGuardOnly(ctx: PipelineExecutionContext): Promise<void> {
    const context: IpcContext = {
      channel: ctx.channel, event: ctx.event, args: ctx.args,
      controllerClass: ctx.controllerClass, instance: ctx.instance,
    }
    try {
      await this.runGuards(ctx, context)
      await ctx.instance[ctx.method](ctx.event, ...ctx.args)
    } catch (err) {
      this.logger.error(`Guard/method error on "${ctx.channel}": ${err}`)
    }
  }

  private async runGuards(ctx: PipelineExecutionContext, context: IpcContext): Promise<void> {
    // 从 Symbol.metadata 读取类级和方法级 Guard
    const classGuards = readMetadata<Function[]>(ctx.controllerClass, META.CLASS_GUARDS) || []
    const methodEntries = readMetadata<MethodMiddlewareEntry[]>(ctx.controllerClass, META.METHOD_GUARDS) || []
    const methodEntry = methodEntries.find(e => e.method === ctx.method)
    const methodGuards = methodEntry?.middlewares || []

    const allGuards = [...this.globalGuards, ...classGuards, ...methodGuards]

    for (const guardClass of allGuards) {
      const guard = this.container.resolve(guardClass) as CanActivate
      const canActivate = await guard.canActivate(context)
      if (!canActivate) {
        throw new ForbiddenException(`Guard ${guardClass.name} denied access to "${ctx.channel}"`)
      }
    }
  }

  private async runPipes(ctx: PipelineExecutionContext, context: IpcContext): Promise<any[]> {
    const classPipes = readMetadata<Function[]>(ctx.controllerClass, META.CLASS_PIPES) || []
    const methodEntries = readMetadata<MethodMiddlewareEntry[]>(ctx.controllerClass, META.METHOD_PIPES) || []
    const methodEntry = methodEntries.find(e => e.method === ctx.method)
    const methodPipes = methodEntry?.middlewares || []

    const allPipes = [...this.globalPipes, ...classPipes, ...methodPipes]

    let args = [...ctx.args]
    for (const pipeClass of allPipes) {
      const pipe = this.container.resolve(pipeClass) as PipeTransform
      if (args.length > 0) {
        args[0] = await pipe.transform(args[0], context)
      }
    }
    return args
  }

  private async runWithInterceptors(
    ctx: PipelineExecutionContext,
    context: IpcContext,
    args: any[]
  ): Promise<any> {
    const classInterceptors = readMetadata<Function[]>(ctx.controllerClass, META.CLASS_INTERCEPTORS) || []
    const methodEntries = readMetadata<MethodMiddlewareEntry[]>(ctx.controllerClass, META.METHOD_INTERCEPTORS) || []
    const methodEntry = methodEntries.find(e => e.method === ctx.method)
    const methodInterceptors = methodEntry?.middlewares || []

    const allInterceptors = [...this.globalInterceptors, ...classInterceptors, ...methodInterceptors]

    const executeController = () => Promise.resolve(ctx.instance[ctx.method](...args))

    if (allInterceptors.length === 0) return executeController()

    // 洋葱模型 — 从后往前包裹
    let chain = executeController
    for (let i = allInterceptors.length - 1; i >= 0; i--) {
      const interceptor = this.container.resolve(allInterceptors[i]) as NestInterceptor
      const next = chain
      chain = () => interceptor.intercept(context, next)
    }
    return chain()
  }

  private runFilters(exception: unknown, context: IpcContext): IpcErrorResponse {
    const classFilters = readMetadata<Function[]>(context.controllerClass, META.CLASS_FILTERS) || []
    const methodEntries = readMetadata<MethodMiddlewareEntry[]>(context.controllerClass, META.METHOD_FILTERS) || []
    const methodEntry = methodEntries.find(e => e.method === context.channel)
    const methodFilters = methodEntry?.middlewares || []

    const allFilters = [...methodFilters, ...classFilters, ...this.globalFilters]

    for (const filterClass of allFilters) {
      const filter = this.container.resolve(filterClass) as ExceptionFilter
      return filter.catch(exception, context)
    }

    if (exception instanceof Error) {
      return {
        __error: true,
        code: 'INTERNAL',
        message: exception.message,
        ...(process.env.NODE_ENV?.includes('dev') ? { stack: exception.stack } : {}),
      }
    }
    return { __error: true, code: 'UNKNOWN', message: 'An unknown error occurred' }
  }
}
```

### 5.5 渲染进程类型安全

框架在构建时扫描所有 Controller 的 `Symbol.metadata`，自动生成渲染进程侧的类型声明文件。

```typescript
// src/core/type-generator/generator.ts

import { META, readMetadata } from '../constants/metadata-keys'
import { ScannedModule } from '../module/scanner'
import * as fs from 'fs'
import type { IpcHandlerEntry } from '../decorators/ipc.decorator'

export class TypeGenerator {
  constructor(private scannedModules: ScannedModule[]) {}

  generate(outputPath: string): void {
    const channels: Array<{ channel: string; params: string; returnType: string }> = []

    for (const mod of this.scannedModules) {
      for (const controllerClass of mod.controllers) {
        const controllerMeta = readMetadata<{ prefix: string }>(controllerClass, META.CONTROLLER)
        const prefix = controllerMeta?.prefix || ''

        const handleMethods = readMetadata<IpcHandlerEntry[]>(controllerClass, META.IPC_HANDLE) || []

        for (const { channel, method } of handleMethods) {
          const fullChannel = prefix ? `${prefix}:${channel}` : channel
          // 通过 ts-morph 或类型反射提取参数和返回类型
          const paramTypes = this.getParamTypes(controllerClass, method)
          const returnType = this.getReturnType(controllerClass, method)

          channels.push({ channel: fullChannel, params: paramTypes, returnType })
        }
      }
    }

    fs.writeFileSync(outputPath, this.buildDeclaration(channels), 'utf-8')
  }

  private buildDeclaration(channels: Array<{ channel: string; params: string; returnType: string }>): string {
    const methods = channels.map(c =>
      `  /** IPC channel: ${c.channel} */\n  '${c.channel}': (${c.params}) => Promise<${c.returnType}>`
    ).join('\n\n')

    return `// AUTO-GENERATED — DO NOT EDIT
export interface IpcApi {
${methods}
}

export interface ElectronAPI {
  invoke: <K extends keyof IpcApi>(channel: K, ...args: Parameters<IpcApi[K]>) => ReturnType<IpcApi[K]>
  on: (channel: string, listener: (...args: any[]) => void) => void
  send: (channel: string, ...args: any[]) => void
}

declare global {
  interface Window { api: ElectronAPI }
}
`
  }

  private getParamTypes(_controllerClass: Function, _method: string | symbol): string {
    // TODO: 通过 ts-morph 从源码 AST 提取精确参数类型
    return '...args: any[]'
  }

  private getReturnType(_controllerClass: Function, _method: string | symbol): string {
    // TODO: 通过 ts-morph 从源码 AST 提取精确返回类型
    return 'any'
  }
}
```

### 5.6 插件系统

```typescript
// src/core/plugin/plugin.interface.ts

import type { Application } from '../application'

export interface Plugin {
  name: string
  install(app: Application): void
  ready?(app: Application): void | Promise<void>
  destroy?(app: Application): void | Promise<void>
}
```

### 5.7 开发热更新（整进程重启）

**不做**框架内进程内软重载（无文件监视 + `app.reload` + 清 `require.cache`）。

主进程 / preload 变更统一依赖 electron-vite：

```bash
electron-vite dev --watch
```

行为与 NestJS 默认 DX 一致：文件变更 → 重建 → **重启进程**。渲染进程仍使用 Vite HMR。

---

## 6. API 设计参考

### 6.1 完整使用示例

```typescript
// ==================== main.ts ====================
import { createApp } from '@electrum/core'
import { AppModule } from './app.module'
import { GlobalExceptionFilter } from './filters/global-exception.filter'
import { LoggingInterceptor } from './interceptors/logging.interceptor'

async function main() {
  const app = createApp(AppModule)

  app.useGlobalFilters(GlobalExceptionFilter)
  app.useGlobalInterceptors(LoggingInterceptor)

  if (process.env.NODE_ENV?.includes('dev')) {
    app.generateTypes('src/renderer/types/api.d.ts')
  }

  await app.start()
}

main()

// ==================== app.module.ts ====================
import { Module } from '@electrum/common'
import { WindowModule } from './window/window.module'
import { FileModule } from './file/file.module'
import { UserModule } from './user/user.module'
import { AppController } from './app.controller'
import { ConfigService } from './config.service'

@Module({
  imports: [WindowModule, FileModule, UserModule],
  controllers: [AppController],
  providers: [
    ConfigService,
    {
      provide: 'APP_CONFIG',
      useFactory: () => ({
        apiBaseUrl: process.env.API_URL || 'http://localhost:3000',
        version: '1.0.0',
      }),
    },
  ],
})
export class AppModule {}

// ==================== file.module.ts ====================
@Module({
  controllers: [FileController],
  providers: [FileService],
})
export class FileModule {}

// ==================== file.controller.ts ====================
import { Controller, IpcHandle, IpcOn, AppEvent, Inject, WindowRef, UseInterceptors } from '@electrum/common'
import { BrowserWindow, IpcMainEvent } from 'electron'
import { FileService } from './file.service'
import { LoggingInterceptor } from '../interceptors/logging.interceptor'

@Controller('file')
@UseInterceptors(LoggingInterceptor)
export class FileController {
  // ★ 属性注入 — TS5 field decorator
  @Inject(FileService)
  fileService!: FileService

  @WindowRef('main')
  mainWindow!: BrowserWindow

  @IpcHandle('read')
  async read(path: string): Promise<string> {
    return this.fileService.read(path)
  }

  @IpcHandle('write')
  async write(data: { path: string; content: string }): Promise<void> {
    await this.fileService.write(data.path, data.content)
    this.mainWindow.webContents.send('file:saved', data.path)
  }

  // @IpcOn — 第一个参数是 IpcMainEvent
  @IpcOn('watch')
  onWatch(event: IpcMainEvent, path: string): void {
    this.fileService.watch(path, (change) => {
      event.reply('file:changed', change)
    })
  }

  @AppEvent('before-quit')
  async onQuit(): Promise<void> {
    await this.fileService.closeAllWatchers()
  }
}

// ==================== file.service.ts ====================
import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from '@electrum/common'
import * as fs from 'fs'

@Injectable()
export class FileService implements OnModuleInit, OnModuleDestroy {
  @Inject('APP_CONFIG')
  config!: { apiBaseUrl: string; version: string }

  private watchers = new Map<string, fs.FSWatcher>()

  onModuleInit() {
    console.log(`FileService initialized, version=${this.config.version}`)
  }

  async read(path: string): Promise<string> {
    return fs.promises.readFile(path, 'utf-8')
  }

  async write(path: string, content: string): Promise<void> {
    await fs.promises.writeFile(path, content, 'utf-8')
  }

  watch(path: string, callback: (change: any) => void): void {
    const watcher = fs.watch(path, (event, filename) => {
      callback({ event, filename, path })
    })
    this.watchers.set(path, watcher)
  }

  closeAllWatchers(): void {
    for (const watcher of this.watchers.values()) watcher.close()
    this.watchers.clear()
  }

  onModuleDestroy() {
    this.closeAllWatchers()
  }
}

// ==================== window/window.module.ts ====================
import { Module, WindowDeclaration } from '@electrum/common'
import * as path from 'path'

@WindowDeclaration({
  name: 'main',
  options: {
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  },
  devUrl: 'http://localhost:5173',
  prodFile: 'dist/renderer/index.html',
})
export class MainWindow {}

@Module({
  declarations: [MainWindow],
})
export class WindowModule {}

// ==================== preload.ts ====================
import { contextBridge, ipcRenderer } from 'electron'

class IpcError extends Error {
  constructor(public code: string, message: string, public details?: unknown) {
    super(message)
    this.name = 'IpcError'
  }
}

contextBridge.exposeInMainWorld('api', {
  invoke: async (channel: string, ...args: any[]) => {
    const result = await ipcRenderer.invoke(channel, ...args)
    if (result && result.__error) {
      throw new IpcError(result.code, result.message, result.details)
    }
    return result
  },
  on: (channel: string, listener: (...args: any[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => listener(...args))
  },
  send: (channel: string, ...args: any[]) => {
    ipcRenderer.send(channel, ...args)
  },
})

// ==================== renderer/index.ts ====================
// 有完整类型提示（依赖自动生成的 api.d.ts）
async function readFile() {
  try {
    const content = await window.api.invoke('file:read', '/path/to/file')
    console.log(content)
  } catch (err) {
    if (err instanceof IpcError) {
      console.error(`[${err.code}] ${err.message}`)
    }
  }
}
```

### 6.2 API 总览

```typescript
// ─── 来自 @electrum/common ───

// === 类装饰器（TS5 Stage 3）===
@Module(metadata)              // 声明模块
@Injectable(options?)          // 声明可注入服务
@Controller(prefix?)           // 声明控制器
@WindowDeclaration(config)     // 声明窗口配置

// === 方法装饰器 ===
@IpcHandle(channel, options?)  // 注册 ipcMain.handle
@IpcOn(channel)                // 注册 ipcMain.on
@AppEvent(eventName)           // 监听 app 事件

// === 属性装饰器（替代旧版参数装饰器）===
@Inject(token)                 // 属性注入 — 按 token 注入依赖
@WindowRef(name?)              // 属性注入 — 注入窗口实例
@Optional()                    // 标记为可选注入（配合 @Inject）

// === 中间件装饰器（支持类级 + 方法级）===
@UseGuards(...guards)          // 挂载 Guard
@UsePipes(...pipes)            // 挂载 Pipe
@UseInterceptors(...inters)    // 挂载 Interceptor
@UseFilters(...filters)        // 挂载 Filter

// === 生命周期接口 ===
OnModuleInit                   // onModuleInit()
OnAppReady                     // onAppReady()
OnModuleDestroy                // onModuleDestroy()

// ─── 来自 @electrum/core ───

// === 应用 API ===
createApp(rootModule)          // 创建应用实例
app.start()                    // 启动应用
app.use(plugin)                // 注册插件
app.useGlobalFilters(...)      // 注册全局 Filter
app.useGlobalGuards(...)       // 注册全局 Guard
app.useGlobalPipes(...)        // 注册全局 Pipe
app.useGlobalInterceptors(...) // 注册全局 Interceptor
app.generateTypes(path)        // 生成类型声明文件
app.resolve(token)             // 手动解析依赖
app.getWindowManager()         // 获取窗口管理器
```

---

## 7. 项目结构

### 7.1 包划分原则（对齐 NestJS）

包名统一使用 **`@electrum`** 作用域前缀，分包职责对齐 NestJS：

| 包名 | 对齐 NestJS | 职责 | 典型导出 |
|---|---|---|---|
| **`@electrum/common`** | `@nestjs/common` | 用户日常 import：装饰器、接口、异常、工具、元数据 Key | `@Module` `@Injectable` `@Controller` `@IpcHandle` `@Inject`、`CanActivate`、`ExceptionFilter`、业务异常基类 |
| **`@electrum/core`** | `@nestjs/core` | 运行时引擎：应用启动、DI、模块扫描、IPC/事件桥接、生命周期、窗口、中间件管道 | `createApp`、`Application`、`DIContainer`、`ModuleScanner`、`IpcBridge` |
| **`@electrum/testing`** | `@nestjs/testing` | 测试工具：测试容器、Electron mock | `createTestContainer`、`mockElectron` |

**用户导入约定**（与 NestJS 心智模型一致）：

```typescript
// 装饰器 / 接口 / 异常 → common
import { Module, Injectable, Controller, IpcHandle, Inject } from '@electrum/common'

// 启动 / 运行时 API → core
import { createApp } from '@electrum/core'

// 测试 → testing
import { createTestContainer } from '@electrum/testing'
```

**后续可扩展包**（不进入 MVP，仅作命名预留）：

| 包名 | 用途 |
|---|---|
| `@electrum/cli` | 脚手架 / 代码生成 |
| `@electrum/plugin-updater` | 自动更新插件 |
| `@electrum/plugin-tray` | 系统托盘插件 |
| `@electrum/plugin-hotkey` | 全局快捷键插件 |

### 7.2 Monorepo 目录结构

```
electrum/
├── packages/
│   ├── common/                            # @electrum/common
│   │   ├── src/
│   │   │   ├── polyfill.ts                 # Symbol.metadata polyfill
│   │   │   ├── constants/
│   │   │   │   └── metadata-keys.ts         # 元数据 Key + 读取工具
│   │   │   ├── decorators/
│   │   │   │   ├── module.decorator.ts
│   │   │   │   ├── injectable.decorator.ts
│   │   │   │   ├── controller.decorator.ts
│   │   │   │   ├── ipc.decorator.ts
│   │   │   │   ├── app-event.decorator.ts
│   │   │   │   ├── inject.decorator.ts      # @Inject + @Optional (field)
│   │   │   │   ├── window-ref.decorator.ts   # @WindowRef (field)
│   │   │   │   ├── window.decorator.ts       # @WindowDeclaration (class)
│   │   │   │   └── middleware.decorator.ts
│   │   │   ├── interfaces/
│   │   │   │   ├── lifecycle.interface.ts    # OnModuleInit / OnModuleDestroy / OnAppReady
│   │   │   │   ├── guard.interface.ts
│   │   │   │   ├── interceptor.interface.ts
│   │   │   │   ├── pipe.interface.ts
│   │   │   │   ├── filter.interface.ts
│   │   │   │   └── plugin.interface.ts
│   │   │   ├── exceptions/
│   │   │   │   ├── base.exception.ts
│   │   │   │   └── error-response.ts
│   │   │   ├── utils/
│   │   │   └── index.ts
│   │   ├── package.json                    # name: "@electrum/common"
│   │   └── tsconfig.json
│   │
│   ├── core/                              # @electrum/core
│   │   ├── src/
│   │   │   ├── application.ts               # Application 启动入口
│   │   │   ├── di/
│   │   │   │   └── container.ts             # DI 容器（属性注入）
│   │   │   ├── module/
│   │   │   │   └── scanner.ts
│   │   │   ├── bridge/
│   │   │   │   ├── ipc-bridge.ts
│   │   │   │   └── event-bridge.ts
│   │   │   ├── middleware/
│   │   │   │   └── pipeline.ts
│   │   │   ├── lifecycle/
│   │   │   │   └── manager.ts
│   │   │   ├── window/
│   │   │   │   └── manager.ts
│   │   │   ├── logger/
│   │   │   │   └── logger.ts
│   │   │   ├── type-generator/
│   │   │   │   └── generator.ts
│   │   │   └── index.ts
│   │   ├── package.json                    # name: "@electrum/core"
│   │   └── tsconfig.json
│   │
│   └── testing/                           # @electrum/testing
│       ├── src/
│       │   ├── test-container.ts
│       │   ├── mock-electron.ts
│       │   └── index.ts
│       ├── package.json                    # name: "@electrum/testing"
│       └── tsconfig.json
│
├── examples/
│   └── basic/                             # @electrum/example-basic
├── docs/
├── package.json                           # 根 workspace（private: electrum）
├── pnpm-workspace.yaml
└── turbo.json
```

### 7.3 包依赖关系

```
                    ┌─────────────────────┐
                    │  @electrum/common   │  零运行时依赖
                    │  装饰器 / 接口 / 异常 │  peer: typescript
                    └──────────┬──────────┘
                               │ depends on
                    ┌──────────▼──────────┐
                    │   @electrum/core    │  peer: electron, typescript
                    │   运行时引擎          │  dep: @electrum/common
                    └──────────┬──────────┘
                               │ depends on
                    ┌──────────▼──────────┐
                    │  @electrum/testing  │  dep: @electrum/core (+ common)
                    │  测试工具            │
                    └─────────────────────┘
```

| 包 | dependencies | peerDependencies |
|---|---|---|
| `@electrum/common` | （空） | `typescript >= 5.2` |
| `@electrum/core` | `@electrum/common` | `electron >= 20`、`typescript >= 5.2` |
| `@electrum/testing` | `@electrum/core`、`@electrum/common` | `vitest`（可选）|

规则：
1. **禁止反向依赖**：`common` 不得依赖 `core` / `testing`
2. **用户业务代码**优先从 `@electrum/common` 取装饰器；仅启动与高级运行时 API 使用 `@electrum/core`
3. **Electron 类型**仅允许出现在 `core`（及 `common` 中必要的类型-only 引用，如 `BrowserWindow`）

---

## 8. 构建与发布

### 8.1 构建工具链

| 工具 | 用途 |
|---|---|
| **TypeScript 5.2+** | 类型系统，**无需** `experimentalDecorators` |
| **tsup** | 基于 esbuild 的快速打包工具 |
| **pnpm** | 包管理 + monorepo workspace |
| **turbo** | monorepo 构建编排 |
| **vitest** | 单元测试 |

### 8.2 tsconfig 关键配置

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",

    // ★ TS5 原生装饰器 — 不设置以下两项！
    // "experimentalDecorators": true,   // ← 注释掉或设为 false
    // "emitDecoratorMetadata": true,     // ← 注释掉或设为 false

    // 以下配置照常
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "useDefineForClassFields": true,  // 确保字段语义正确
    "lib": ["ES2022", "ESNext.Decorators"],
    "types": ["node"]
  }
}
```

> **关键点**：不设置 `experimentalDecorators` 时，TypeScript 5 自动启用 Stage 3 装饰器。`lib` 中加入 `ESNext.Decorators` 以获得装饰器相关的类型声明。`useDefineForClassFields: true` 确保字段语义与 Stage 3 装饰器兼容。

### 8.3 tsup 构建配置

```typescript
// tsup.config.ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  target: 'es2022',
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  // core 包需 external electron + @electrum/common；common 包无 runtime external
  external: ['electron', '@electrum/common'],
})
```

### 8.4 package.json（各包示意）

**根 workspace**

```json
{
  "name": "electrum",
  "version": "0.1.0",
  "private": true,
  "description": "NestJS-inspired MVC framework for Electron (@electrum/*)",
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "dev:example": "pnpm --filter @electrum/example-basic dev"
  },
  "engines": { "node": ">=18" },
  "license": "MIT"
}
```

**`@electrum/common`**

```json
{
  "name": "@electrum/common",
  "version": "0.1.0",
  "description": "Decorators, interfaces, and shared utilities for Electrum",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "test": "vitest"
  },
  "peerDependencies": {
    "typescript": ">=5.2.0"
  },
  "dependencies": {},
  "license": "MIT"
}
```

**`@electrum/core`**

```json
{
  "name": "@electrum/core",
  "version": "0.1.0",
  "description": "Electrum runtime — DI, module scanner, IPC bridge, application bootstrap",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "test": "vitest"
  },
  "peerDependencies": {
    "electron": ">=20.0.0",
    "typescript": ">=5.2.0"
  },
  "dependencies": {
    "@electrum/common": "workspace:*"
  },
  "devDependencies": {
    "electron": "^32.0.0",
    "typescript": "^5.5.0",
    "tsup": "^8.0.0",
    "vitest": "^2.0.0"
  },
  "keywords": [
    "electron",
    "framework",
    "mvc",
    "dependency-injection",
    "decorator",
    "ipc",
    "nestjs",
    "typescript5",
    "stage3-decorators",
    "symbol-metadata"
  ],
  "license": "MIT"
}
```

**`@electrum/testing`**

```json
{
  "name": "@electrum/testing",
  "version": "0.1.0",
  "description": "Testing utilities for Electrum applications",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "test": "vitest"
  },
  "dependencies": {
    "@electrum/common": "workspace:*",
    "@electrum/core": "workspace:*"
  },
  "license": "MIT"
}
```

> **注意**：`@electrum/common` 与运行时之外的依赖均为空 — **零第三方运行时依赖**。不再需要 `reflect-metadata`。`tsup` 的 `external` 需包含 `electron`、`@electrum/common`（core 包内）。

---

## 9. 测试策略

### 9.1 测试分层

| 层级 | 工具 | 目标 |
|---|---|---|
| **单元测试** | vitest + mock-electron | DI 容器、模块扫描器、装饰器元数据 |
| **集成测试** | vitest + electron-mock | IPC 桥接、中间件链、生命周期 |
| **E2E 测试** | Playwright for Electron | 完整应用流程 |

### 9.2 测试容器

```typescript
// packages/testing/src/test-container.ts

import { DIContainer } from '@electrum/core'

export class TestContainer {
  private container = new DIContainer()

  register(token: any, provider: any): this {
    this.container.register(token, provider)
    return this
  }

  resolve<T>(token: any): T {
    return this.container.resolve<T>(token)
  }

  mock(token: any, value: any): this {
    this.container.register(token, { useValue: value })
    return this
  }
}

export function createTestContainer(): TestContainer {
  return new TestContainer()
}
```

### 9.3 测试示例

```typescript
// file.service.spec.ts
import { describe, it, expect } from 'vitest'
import { createTestContainer } from '@electrum/testing'
import { FileService } from './file.service'

describe('FileService', () => {
  it('should read file content', async () => {
    const container = createTestContainer()
      .mock('APP_CONFIG', { apiBaseUrl: 'http://test', version: '0.0.0' })

    const service = container.resolve<FileService>(FileService)

    const content = await service.read('./test/fixtures/sample.txt')
    expect(content).toBe('Hello, World!')
  })

  it('should cleanup watchers on destroy', async () => {
    const container = createTestContainer()
      .mock('APP_CONFIG', { apiBaseUrl: '', version: '0' })

    const service = container.resolve<FileService>(FileService)
    service.watch('/tmp/test', () => {})
    await service.onModuleDestroy()

    expect(service['watchers'].size).toBe(0)
  })
})
```

### 9.4 元数据测试

```typescript
// metadata.spec.ts — 验证 TS5 装饰器元数据写入正确
import { describe, it, expect } from 'vitest'
import { Module, Controller, IpcHandle, Inject, Injectable } from '@electrum/common'
import { META, readMetadata } from '@electrum/common'

@Injectable()
class TestService {}

@Controller('test')
class TestController {
  @Inject(TestService) svc!: TestService

  @IpcHandle('action')
  doAction() {}
}

describe('TS5 Decorator Metadata', () => {
  it('should store controller prefix', () => {
    const meta = readMetadata<{ prefix: string }>(TestController, META.CONTROLLER)
    expect(meta?.prefix).toBe('test')
  })

  it('should store IPC handle methods', () => {
    const handlers = readMetadata(TestController, META.IPC_HANDLE)
    expect(handlers).toHaveLength(1)
    expect(handlers[0].channel).toBe('action')
  })

  it('should store injection points', () => {
    const injections = readMetadata(TestController, META.INJECTIONS)
    expect(injections).toHaveLength(1)
    expect(injections[0].token).toBe(TestService)
  })
})
```

---

## 10. 路线图

### v0.1.0 — MVP（TS5 原生装饰器 + `@electrum/*` 分包）

- [x] 包体系：`@electrum/common` / `@electrum/core`（对齐 NestJS）
- [x] `Symbol.metadata` polyfill
- [x] 装饰器系统（`@Module` `@Injectable` `@Controller` `@IpcHandle` `@IpcOn`）
- [x] 属性注入 DI 容器（`@Inject` `@WindowRef` field decorator）
- [x] 模块扫描器（读取 `Symbol.metadata`）
- [x] IPC 桥接层
- [x] 生命周期管理
- [x] 错误处理
- [x] 日志系统

### v0.2.0 — 中间件链

- [ ] Guard / Interceptor / Pipe / Filter
- [ ] 中间件管道编排（洋葱模型）
- [ ] 全局中间件注册

### v0.3.0 — 窗口与事件

- [ ] 声明式窗口管理
- [ ] `@WindowRef` 属性注入
- [ ] Event Bridge（`@AppEvent`）
- [ ] 多窗口通信

### v0.4.0 — 类型安全

- [ ] 基于 ts-morph 的精确类型提取
- [ ] 渲染进程 `api.d.ts` 自动生成
- [ ] Preload 脚本生成

### v0.5.0 — 开发体验

- [ ] electron-vite 集成预设（`dev --watch` 整进程重启）
- [ ] `@electrum/testing` 测试工具包
- [ ] `@electrum/cli` 脚手架

### v0.6.0 — 插件生态

- [ ] 插件系统（`@electrum/plugin-*`）
- [ ] 自动更新 / 托盘 / 快捷键插件

### v1.0.0 — 稳定版

- [ ] 完整文档站
- [ ] 性能基准测试
- [ ] 迁移指南

---

## 附录 A：与现有框架对比

| 维度 | 本框架 | einf | noxus | @electrojs/runtime | @devisfuture/electron-modular |
|---|---|---|---|---|---|
| **装饰器标准** | ✅ TS5 Stage 3 | ❌ experimentalDecorators | ❌ experimentalDecorators | ❌ experimentalDecorators | ❌ experimentalDecorators |
| **元数据机制** | Symbol.metadata | reflect-metadata | reflect-metadata | reflect-metadata | reflect-metadata |
| **运行时依赖** | **零** | reflect-metadata | 有 | 有 | 有 |
| **注入方式** | 属性注入 | 构造函数注入 | 构造函数注入 | 构造函数 + inject() | 构造函数注入 |
| **Module 系统** | ✅ | ❌ | ✅ | ✅ | ✅ |
| **DI 作用域** | singleton + transient | 无 | 3 种 | 2 种 | 有 |
| **循环依赖检测** | ✅ | ❌ | ❌ | ✅ | ❌ |
| **Guard** | ✅ | ❌ | ✅ | ❌ | ❌ |
| **Interceptor** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Pipe** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Filter** | ✅ | ❌ | ✅ | ✅ | ❌ |
| **生命周期** | 3 钩子 | ❌ | 1 个 | 5 个 | 有 |
| **窗口管理** | 声明式 + 属性注入 | @Window() | 服务 | 声明式 | @WindowManager |
| **类型生成** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **开发热更新** | `--watch` 重启 | ❌ | ❌ | ❌ | ❌ |
| **体积** | <50KB | <10KB | 中 | 大 | 中 |

---

## 附录 B：TS5 装饰器 vs 旧版装饰器迁移指南

### B.1 tsconfig 变更

```jsonc
// ❌ 旧配置
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "types": ["node", "reflect-metadata"]
  }
}

// ✅ 新配置
{
  "compilerOptions": {
    // 不设置 experimentalDecorators → 自动启用 Stage 3
    "useDefineForClassFields": true,
    "lib": ["ES2022", "ESNext.Decorators"],
    "types": ["node"]
  }
}
```

### B.2 依赖变更

```json
// ❌ 旧依赖
{
  "dependencies": {
    "reflect-metadata": "^0.2.0"
  }
}

// ✅ 新依赖
{
  "dependencies": {}
}
```

### B.3 装饰器签名变更

```typescript
// ❌ 旧版 (experimentalDecorators)
function Module(meta: ModuleMetadata): ClassDecorator {
  return (target: Function) => {
    Reflect.defineMetadata('module', meta, target)
    return target
  }
}

// ✅ TS5 (Stage 3)
function Module(meta: ModuleMetadata) {
  return (target: Function, context: ClassDecoratorContext): void => {
    context.metadata[META.MODULE] = meta
  }
}
```

```typescript
// ❌ 旧版方法装饰器
function IpcHandle(channel: string): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    const handlers = Reflect.getMetadata('ipc_handle', target.constructor) || []
    handlers.push({ channel, method: propertyKey })
    Reflect.defineMetadata('ipc_handle', handlers, target.constructor)
  }
}

// ✅ TS5 方法装饰器
function IpcHandle(channel: string) {
  return (method: Function, context: ClassMethodDecoratorContext): Function => {
    const handlers = context.metadata[META.IPC_HANDLE] || []
    handlers.push({ channel, method: context.name })
    context.metadata[META.IPC_HANDLE] = handlers
    return method
  }
}
```

### B.4 注入方式变更

```typescript
// ❌ 旧版 — 构造函数注入
@Controller('file')
class FileController {
  constructor(
    private fileService: FileService,
    @WindowRef('main') private mainWindow: BrowserWindow,
    @Inject('CONFIG') private config: AppConfig,
  ) {}
}

// ✅ TS5 — 属性注入
@Controller('file')
class FileController {
  @Inject(FileService)
  fileService!: FileService

  @WindowRef('main')
  mainWindow!: BrowserWindow

  @Inject('CONFIG')
  config!: AppConfig
}
```

### B.5 元数据读取变更

```typescript
// ❌ 旧版 — Reflect API
const meta = Reflect.getMetadata('module', target)
const paramTypes = Reflect.getMetadata('design:paramtypes', target)

// ✅ TS5 — Symbol.metadata
const meta = target[Symbol.metadata]?.[META.MODULE]
const injections = target[Symbol.metadata]?.[META.INJECTIONS] || []
```

### B.6 参数装饰器移除

```typescript
// ❌ 旧版 — 参数装饰器（TS5 不支持）
@IpcHandle('file:read')
readFile(@Payload() path: string, @Event() event: IpcMainInvokeEvent) {}

// ✅ TS5 — 位置约定（无参数装饰器）
@IpcHandle('file:read')
readFile(path: string) {}  // 参数直接是 invoke 传入的值
```

---

> **文档结束**  
> 本设计方案基于 TypeScript 5 Stage 3 装饰器标准，面向未来，零运行时依赖。  
> 如有疑问或建议，请提交 Issue。
