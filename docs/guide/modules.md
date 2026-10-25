# 模块

模块是组织应用结构的基本单元。每个应用至少有一个**根模块**（传给 `createApp` 的那个）。一个模块用 `@Module()` 描述：本模块有哪些 Controllers / Providers，依赖哪些子模块，以及窗口声明。

```ts
import { Module } from '@electrum/common'
import { UserController } from './user.controller'
import { UserService } from './user.service'
import { FileModule } from '../file/file.module'

@Module({
  imports: [FileModule],
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule {}
```

根模块再被 `createApp` 接收：

```ts
@Module({
  imports: [WindowModule, FileModule, UserModule],
  controllers: [AppController],
  providers: [ConfigService],
})
export class AppModule {}

await createApp(AppModule).start()
```

## 元数据字段

| 字段 | 含义 |
|------|------|
| `imports` | 先扫描的子模块（DFS：先 imports 再自身） |
| `controllers` | IPC 入口类，会注册进 DI 并由 IpcBridge 绑定 |
| `providers` | 可注入服务；支持 class / `useClass` / `useValue` / `useFactory` |
| `exports` | 对外暴露的 Provider 白名单；**不写 = 全部暴露**（见下节） |
| `declarations` | 窗口声明类（配合 `@WindowDeclaration`） |

## 功能拆分

建议按领域拆模块（如 `FileModule`、`UserModule`），根模块只负责组装。可以从单个 Controller + 单个 Module 起步，再逐步拆分。

## 扫描顺序

1. 根模块递归 `imports`
2. 每个模块的 providers / controllers 登记到容器
3. 再创建窗口、绑定 IPC、触发生命周期

同一模块树只会扫描一次（visited 防环）。未标注 `@Module` 的类作为根模块会在扫描时报错。

模块扫描会注册 Provider 并解析 imports；日常用法按上表即可。

## Provider 可见性（exports）

默认情况下，模块里的 Provider 是「全应用可见」的。想让某些 Provider 只在模块内部使用时，声明 `exports` 白名单：

```ts
@Module({
  providers: [UserService, UserRepository],
  exports: [UserService], // 只暴露 UserService
  controllers: [UserController],
})
export class UserModule {}

@Module({
  imports: [UserModule],
  controllers: [OrderController],
})
export class OrderModule {}
// ✅ OrderModule 可以注入 UserService
// ❌ OrderModule 注入 UserRepository 会抛 "not visible from OrderModule"
```

规则（与 Nest 一致，但保留向后兼容）：

| owner（Provider 所属模块） | consumer（调用方）能否注入 |
|---|---|
| consumer 自己 | ✅ 总是可见 |
| owner 没写 `exports` | ✅ 全应用可见（旧行为） |
| owner 写了 `exports` 且包含该 token | ✅ 可见 |
| owner 写了 `exports` 但不含该 token | ❌ 抛错 |
| 通过 `imports` 链间接到达 | 路径上每个「声明了 exports 的」中间模块都必须把它转发出来 |

两个容易踩的点：

- **`exports: []` 是严格模式**——声明了空数组等于「什么都不导出」，不是「全部导出」。
- **转发要逐层写**：`A imports B imports C`，若 `B` 自己声明了 `exports`，那么 `C` 的 Provider 要被 `A` 看到就必须出现在 `B` 的 `exports` 里。

> `ModuleRegistry`（封装这套可见性判定的类）是 `@electrum/core` 内部实现，由 `DIContainer` 私有持有；业务方只需要在 `@Module({ exports })` 里写数组，不需要也**不应该**直接 `new` 或调用它。

## 下一步

→ [中间件管道](./middleware)
