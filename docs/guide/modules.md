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
| `exports` | 对外暴露的 Provider 白名单；**不写 = 全部私有**（见下节） |
| `declarations` | 窗口声明类（配合 `@WindowDeclaration`） |
| `global` | 等价 `@Global()`，全局可见；一般直接用装饰器 |

## 功能拆分

建议按领域拆模块（如 `FileModule`、`UserModule`），根模块只负责组装。可以从单个 Controller + 单个 Module 起步，再逐步拆分。

## 扫描顺序

1. 根模块递归 `imports`
2. 每个模块的 providers / controllers 登记到容器
3. 再创建窗口、绑定 IPC、触发生命周期

同一模块树只会扫描一次（visited 防环）。未标注 `@Module` 的类作为根模块会在扫描时报错。

模块扫描会注册 Provider 并解析 imports；日常用法按上表即可。

## Provider 可见性（exports）

模块里的 Provider **默认私有**，只有写进 `exports` 才对其它模块可见——与 Nest 一致：

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

判定规则：

| owner（Provider 所属模块） | consumer（调用方）能否注入 |
|---|---|
| consumer 自己 | ✅ 总是可见 |
| owner 没写 `exports` | ❌ 私有 |
| owner 的 `exports` 含该 token | ✅ 可见（要求 consumer 经 `imports` 到达 owner） |
| owner 的 `exports` 不含该 token | ❌ 抛错 |
| owner 被 `@Global()` 标记 | ✅ 无需 `imports`，全局可见 |

### 逐层转发

`exports` 里可以写 **token**，也可以写 **模块类**。两种写法都支持跨层转发：

```ts
@Module({ providers: [DeepService], exports: [DeepService] })
export class DeepModule {}

// 写法一：转发 token
@Module({ imports: [DeepModule], exports: [DeepService] })
export class MidModule {}

// 写法二：转发整个模块（等价于转出 DeepModule 的全部 exports）
@Module({ imports: [DeepModule], exports: [DeepModule] })
export class MidModule2 {}

@Module({ imports: [MidModule] })
export class TopModule {} // ✅ 能注入 DeepService
```

中间模块**不写 `exports` 就不会继续向下穿透**——想转发就必须显式写出来，这一点与 Nest 相同。

### 全局模块

`@Global()` 标记的模块不需要被 `imports` 就能被任何模块注入，适合配置、日志、数据库连接这类基础设施：

```ts
@Global()
@Module({
  providers: [ConfigService, { provide: 'APP_CONFIG', useValue: {...} }],
  exports: [ConfigService, 'APP_CONFIG'],
})
export class ConfigModule {}
```

`@Global()` 与 `@Module()` 的先后顺序无关，两者写在同一个类上即可。

> **同名 token**：两个模块各自 `providers` 同一个 token 时，每个模块都能注入自己注册的那份，但**实例是共享的**（后注册的实现生效）。Nest 为每个模块维护独立 injector，这里还没有做到实例隔离——同名 token 应尽量用字符串/symbol 前缀区分。

> `ModuleRegistry`（封装这套可见性判定的类）是 `@electrum/core` 内部实现，由 `DIContainer` 私有持有；业务方只需要在 `@Module({ exports })` / `@Global()` 里声明，不需要也**不应该**直接 `new` 或调用它。

## 下一步

→ [中间件管道](./middleware)
