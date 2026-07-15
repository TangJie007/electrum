# 模块系统

`@Module` 是应用组织边界：声明本模块提供哪些 Controller / Provider，以及依赖哪些子模块、窗口声明。

## 基本写法

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

根模块再被 `createApp(AppModule)` 接收：

```ts
@Module({
  imports: [WindowModule, FileModule, UserModule],
  controllers: [AppController],
  providers: [ConfigService],
})
export class AppModule {}
```

## 元数据字段

| 字段 | 含义 |
|------|------|
| `imports` | 先扫描的子模块（DFS：先 imports 再自身） |
| `controllers` | IPC 入口类，会注册进 DI 并用 IpcBridge 绑定 |
| `providers` | 可注入服务；支持 class / `useClass` / `useValue` / `useFactory` |
| `declarations` | 窗口声明类（配合 `@WindowDeclaration`） |

## Provider 几种形式

```ts
@Module({
  providers: [
    // 简写：token = 类本身
    ConfigService,

    // 令牌 + 工厂
    {
      provide: 'APP_CONFIG',
      useFactory: () => ({
        appName: 'Electrum Demo',
        version: '0.1.0',
      }),
    },
  ],
})
export class AppModule {}
```

注入自定义 token：

```ts
@Inject('APP_CONFIG')
config!: { appName: string; version: string }
```

## 扫描顺序（使用时需要知道）

1. 根模块递归 `imports`
2. 每个模块的 providers / controllers 登记到容器
3. 后续再创建窗口、绑定 IPC、触发生命周期

同一模块树只会扫描一次（visited 防环）。未标注 `@Module` 的类作为根模块会在扫描时报错。

更细的源码走读见 [模块扫描与 DI](/core/di-and-modules) 与 [ModuleScanner 设计](/core/module-scanner)。

## 下一步

→ [依赖注入](./dependency-injection)
