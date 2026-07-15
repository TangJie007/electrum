# 类型生成与插件

对应源码：

- `packages/core/src/type-generator/generator.ts`
- `packages/core/src/plugin/plugin.interface.ts`
- `packages/core/src/application.ts`（`generateTypes` / `use`）

## 1. TypeGenerator（当前能力）

### 做什么

扫描所有 `@IpcHandle` 通道，写出渲染侧声明文件骨架，例如：

```ts
export interface IpcApi {
  'file:read': (...args: any[]) => Promise<any>
  // ...
}

export interface ElectronAPI {
  invoke: <K extends keyof IpcApi>(channel: K, ...args: Parameters<IpcApi[K]>) => ReturnType<IpcApi[K]>
  on: ...
  send: ...
}

declare global {
  interface Window { api: ElectronAPI }
}
```

调用方式：

```ts
createApp(AppModule).generateTypes('src/renderer/types/api.d.ts')
```

或在 `start` 前，只要已能 scan 根模块即可。

### 局限（学习时别误解）

当前实现 **尚未** 用 ts-morph 抽真实参数/返回类型；一律 `any`。  
路线图 v0.4 才是「精确类型 + preload 生成」。现在的生成器用于：

- 保证通道名有类型键  
- 给 `Window.api.invoke` 提供 channel 字面量联合的基础

读代码时重点看：如何从 `META.CONTROLLER` + `META.IPC_HANDLE` 拼出 `prefix:channel`，与 IpcBridge 规则一致。

## 2. Plugin 接口

```ts
interface Plugin {
  name: string
  install(app: Application): void           // use() 时立刻
  ready?(app: Application): void | Promise  // start 成功、生命周期钩子之后
  destroy?(app: Application): void | Promise // before-quit
}
```

使用：

```ts
app.use({
  name: 'demo',
  install(app) { /* 可挂全局 Guard 等 */ },
  async ready(app) { /* 应用已可收 IPC */ },
  async destroy() { /* 释放外部资源 */ },
})
```

插件能拿到整个 `Application`，因此可 `resolve` / `getWindowManager` / `useGlobal*`。  
官方 `@electrum/plugin-*` 包是后续阶段；现在先通过该接口扩展。

## 3. 学习 checklist

学完 core 后，建议你能不看文档回答：

1. `start()` 九步里，哪一步之前 `@WindowRef` 才能成功？  
2. `IpcHandle` 与 `IpcOn` 中间件路径差在哪？  
3. DI 为什么是 `new()` 后再读 `META.INJECTIONS`？  
4. Filter 返回值为什么要带 `__error`？  
5. 开发态主进程改代码靠什么生效？（`--watch` 整进程重启）

对照自测：在 `examples/basic` 打断点跟一遍 `createApp(...).start()`。

返回：[Core 学习指南首页](/core/)
