# Specs ↔ `@electrum/core` 对照

本文说明 `specs/` 里哪些功能分片由 **`packages/core`** 负责实现，便于对照需求和源码学习。

> Specs 目前多为骨架（`draft`），**未全部走完 wetspec 验收**。下表「完成度」按仓库现状主观评估，不等于 `wetspec verify` 通过。

## 总览

```
specs/ 需求分片
    │
    ├── @electrum/common   ← 装饰器 / 元数据 / 异常 / Logger（声明层）
    ├── @electrum/core     ← 扫描 / DI / IPC / 管道 / 窗口 / 事件 / 生命周期（运行时）
    ├── @electrum/testing  ← 测试容器
    └── 工程 / 示例        ← 包体系、electron-vite、preload 约定等
```

**Core 一句话**：把 common 写下的元数据读出来，装配容器，并绑到 Electron。

---

## 一、由 Core 实现的 Spec 分片

| Spec 模块 | 功能 Spec | 源码位置 | 完成度 | 说明 |
|-----------|-----------|----------|--------|------|
| 应用启动与 API | createApp 启动编排 | `application.ts` | ✅ 基本有 | `start()` 串联扫描→窗→IPC→钩子 |
| 应用启动与 API | Application 运行时 API | `application.ts` | ✅ 基本有 | `use` / `useGlobal*` / `resolve` / `reload` 等 |
| 依赖注入容器 | 属性注入解析 | `di/container.ts` | ✅ 基本有 | `new` + 读 `META.INJECTIONS` |
| 依赖注入容器 | 作用域与循环依赖检测 | `di/container.ts` | ✅ 基本有 | singleton / transient + resolving 链 |
| 模块系统 | ModuleScanner 模块树扫描 | `module/scanner.ts` | ✅ 基本有 | DFS imports，注册 Provider |
| 模块系统 | ModuleScanner 模块树扫描 | `module/scanner.ts` | ✅ 代码有 | Provider 全局同一容器 |
| IPC 桥接 | Controller 自动绑定 ipcMain | `bridge/ipc-bridge.ts` | ✅ 基本有 | `prefix:channel` → handle/on |
| IPC 桥接 | IPC 参数位置约定 | `ipc-bridge` + `pipeline` | ✅ 基本有 | Handle 无 event；On 有 event |
| 中间件链 | Guard Pipe Interceptor Filter 管道 | `middleware/pipeline.ts` | ✅ 代码有 | 缺按 Spec AC 的正式验收 |
| 中间件链 | 中间件装饰器与全局注册 | pipeline + `useGlobal*` | ✅ 代码有 | 装饰器本体在 common |
| 窗口管理 | 声明式窗口创建与 DI 集成 | `window/manager.ts` | ✅ 基本有 | 先建窗再 resolve `@WindowRef` |
| 窗口管理 | 跨窗口通信 | `window/manager.ts` | ✅ 基本有 | `sendTo` / `broadcast` |
| 事件系统 | EventBridge 绑定 AppEvent | `bridge/event-bridge.ts` | ✅ 基本有 | `app.on` → 实例方法 |
| 生命周期 | 三钩子接口与并行执行 | `lifecycle/manager.ts` | ✅ 基本有 | `allSettled` 并行 |
| 生命周期 | 启动退出时序 | `application.ts` | ✅ 基本有 | ready / before-quit |
| 类型生成 | 渲染进程 api.d.ts 生成 | `type-generator/generator.ts` | ⚠️ 骨架 | 通道有，类型多为 `any` |
| 类型生成 | ts-morph 精确类型与 Preload 生成 | — | ❌ 未做 | 路线图 v0.4 |
| 插件系统 | Plugin 接口与安装生命周期 | `plugin/` + `use()` | ⚠️ 接口有 | `install` / `ready` / `destroy` |
| 插件系统 | 官方插件包命名预留 | — | ❌ 仅预留 | `@electrum/plugin-*` |
| HMR 与开发体验 | Controller HMR 热重载 | `application.reload` | ⚠️ 半成品 | 有 reload，无完整文件监视 |
| HMR 与开发体验 | electron-vite 集成预设 | 示例配置 | ⚠️ 非框架包 | 见 `examples/basic` |

### Core 源码 ↔ Spec 速查

```
application.ts          → 应用启动与 API、生命周期时序、HMR.reload、插件编排
di/container.ts         → 依赖注入容器
module/scanner.ts       → 模块系统
bridge/ipc-bridge.ts    → IPC 桥接
middleware/pipeline.ts  → 中间件链（运行时执行）
window/manager.ts       → 窗口管理
bridge/event-bridge.ts  → 事件系统
lifecycle/manager.ts    → 生命周期钩子执行
type-generator/         → 类型生成（当前仅骨架）
plugin/                 → 插件系统接口
```

---

## 二、不在 Core（声明层 / 其它包）

| Spec 模块 | 主要归属 | 说明 |
|-----------|----------|------|
| TS5 装饰器元数据机制 | `@electrum/common` | polyfill、META、readMetadata |
| 装饰器系统 | `@electrum/common` | `@Module` / `@IpcHandle` / `@Inject` 等 |
| 错误处理 | `@electrum/common` + 示例 preload | 异常类在 common；渲染还原在示例 |
| 日志系统 | `@electrum/common` | `Logger` |
| 包体系与工程化 | monorepo 根工程 | workspace / tsup / tsconfig |
| 测试工具 | `@electrum/testing` | `createTestContainer` |

Core **依赖并读取** common 的元数据，但不「实现」装饰器本身。

---

## 三、学习建议（对齐 Spec）

若按 Spec 分片读 core，优先这 6 块（已有较完整代码）：

1. 应用启动与 API  
2. 依赖注入容器  
3. 模块系统（扫描部分）  
4. IPC 桥接  
5. 中间件链  
6. 窗口 + 事件 + 生命周期  

后续再补：类型生成精确化、HMR、官方插件。

相关文档：

- [Core 学习指南](/core/)
- [架构总览](./architecture.md)
