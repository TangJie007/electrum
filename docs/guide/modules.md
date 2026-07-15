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
| `declarations` | 窗口声明类（配合 `@WindowDeclaration`） |

## 功能拆分

建议按领域拆模块（如 `FileModule`、`UserModule`），根模块只负责组装。可以从单个 Controller + 单个 Module 起步，再逐步拆分。

## 扫描顺序

1. 根模块递归 `imports`
2. 每个模块的 providers / controllers 登记到容器
3. 再创建窗口、绑定 IPC、触发生命周期

同一模块树只会扫描一次（visited 防环）。未标注 `@Module` 的类作为根模块会在扫描时报错。

更细的源码走读见 [模块扫描与 DI](/core/di-and-modules) 与 [ModuleScanner 设计](/core/module-scanner)。

## 下一步

→ [中间件](./middleware)
