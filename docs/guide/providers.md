# Providers

Providers 是 Electrum 中可被注入的基本概念——最常见的是 **Service**：封装业务逻辑，由 Controller 或其它 Provider 调用。

用 `@Injectable()` 标记一个类后，即可把它放进模块的 `providers`，再通过 `@Inject` 注入到需要它的地方。

::: tip 提示
Electrum 的 DI **不使用构造函数参数注入**（Stage 3 装饰器没有成熟的参数装饰器路径），采用 **属性注入**：在字段上标记 `@Inject`，在 `resolve` 时赋值。
:::

## 服务示例

```ts
import { Injectable, Inject } from '@electrum/common'

@Injectable()
export class Logger {
  log(msg: string) {
    console.log(msg)
  }
}

@Injectable()
export class UserService {
  @Inject(Logger)
  logger!: Logger

  list() {
    this.logger.log('list users')
    return []
  }
}
```

在模块中声明：

```ts
@Module({
  providers: [Logger, UserService],
  controllers: [UserController],
})
export class UserModule {}
```

扫描阶段只会 `register`（登记配方）；IPC 绑定或生命周期触发时才会 `resolve`，此时 `@Inject` 字段才有值。

## 心智模型

```
装饰器不注入，只写「字段 X 需要 token Y」
register 不创建对象，只登记配方
resolve 才干活：new Cls() → 读 @Inject → 递归 resolve → 赋到字段
```

## 常用装饰器

| 装饰器 | 用途 |
|--------|------|
| `@Injectable()` | 标记可注入类（惯例；便于与 Nest 对齐） |
| `@Inject(token)` | 字段注入；token 可以是类或字符串 / symbol |
| `@Optional()` | 解析失败时不抛错（配合可选依赖） |
| `@WindowRef(name)` | 注入名为 `name` 的 `BrowserWindow` |

## 自定义 Provider

除了直接写类，还支持 `useClass` / `useValue` / `useFactory`：

```ts
@Module({
  providers: [
    ConfigService,
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

## 作用域

通过 `@Injectable({ scope })` 控制实例生命周期：

| Scope | 行为 |
|-------|------|
| `'singleton'`（默认） | 首次 `resolve` 后缓存，之后复用同一实例 |
| `'transient'` | 每次 `resolve` 都 `new` + 属性注入，不缓存 |

```ts
@Injectable()
class FileService {} // 默认 singleton，应用内一份

@Injectable({ scope: 'transient' })
class RequestContext {} // 每次 resolve 都是新实例
```

ModuleScanner 注册类 Provider 时会读出 `scope`，再传给 `container.register`。日常 Service / Controller 用默认单例即可。

注意：若 **transient** 服务只被注入到 **singleton** Controller，通常在第一次 resolve 该 Controller 时创建一次，并挂在那一个 Controller 上——不会「每次 IPC 都 new」。需要按请求新建时，应在每次调用路径上主动 `resolve`（或自行工厂），而不是只依赖字段注入。

更细的容器行为见 [模块扫描与 DI](/core/di-and-modules#3-scope)。

## 动手理解 DI

仓库提供教学向示例 [`examples/di`](https://github.com/TangJie007/electrum/tree/main/examples/di)，用最少代码重写 polyfill → metadata → injectable → inject → container：

```bash
cd examples/di
pnpm demo
pnpm start
```

完整应用里不必手写 `container.register`；`@Module` + `ModuleScanner` 会完成批量注册。

## 下一步

→ [模块](./modules)
