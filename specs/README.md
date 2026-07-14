# Spec 目录

> 由 wetspec 管理 | 功能总数：33  
> 来源 PRD：待补充  
> 最后索引更新：2026-07-14

## 模块概览

| 模块 | 功能数 | 功能 |
|------|--------|------|
| [HMR 与开发体验](./HMR 与开发体验/INDEX.md) | 2 | Controller HMR 热重载、electron-vite 集成预设 |
| [IPC 桥接](./IPC 桥接/INDEX.md) | 2 | Controller 自动绑定 ipcMain、IPC 参数位置约定 |
| [TS5 装饰器元数据机制](./TS5 装饰器元数据机制/INDEX.md) | 2 | Symbol.metadata Polyfill、元数据 Key 与读取工具 |
| [中间件链](./中间件链/INDEX.md) | 2 | Guard Pipe Interceptor Filter 管道、中间件装饰器与全局注册 |
| [事件系统](./事件系统/INDEX.md) | 1 | EventBridge 绑定 AppEvent |
| [依赖注入容器](./依赖注入容器/INDEX.md) | 2 | 作用域与循环依赖检测、属性注入解析 |
| [包体系与工程化](./包体系与工程化/INDEX.md) | 3 | @electrum 分包模型、Monorepo 构建与发布、TS5 原生装饰器工程配置 |
| [应用启动与 API](./应用启动与 API/INDEX.md) | 2 | Application 运行时 API、createApp 启动编排 |
| [插件系统](./插件系统/INDEX.md) | 2 | Plugin 接口与安装生命周期、官方插件包命名预留 |
| [日志系统](./日志系统/INDEX.md) | 1 | 分级上下文 Logger |
| [模块系统](./模块系统/INDEX.md) | 1 | ModuleScanner 模块树扫描 |
| [测试工具](./测试工具/INDEX.md) | 2 | Electron Mock 与元数据测试支撑、测试容器 createTestContainer |
| [生命周期](./生命周期/INDEX.md) | 2 | 三钩子接口与并行执行、启动退出时序 |
| [窗口管理](./窗口管理/INDEX.md) | 2 | 声明式窗口创建与 DI 集成、跨窗口通信 |
| [类型生成](./类型生成/INDEX.md) | 2 | ts-morph 精确类型与 Preload 生成、渲染进程 api.d.ts 生成 |
| [装饰器系统](./装饰器系统/INDEX.md) | 3 | IPC 与 App 事件方法装饰器、属性注入装饰器 Inject Optional WindowRef、类装饰器 Module Injectable Controller |
| [错误处理](./错误处理/INDEX.md) | 2 | ElectronException 与 IpcErrorResponse、渲染进程错误还原约定 |

## 常用命令

```bash
# 需已安装: npm install @wetspace/wetspec-cli 或 pnpm add @wetspace/wetspec-cli
wetspec validate specs/
wetspec sync-md specs/ --check
wetspec coverage <prd> specs/
wetspec doctor specs/
```
