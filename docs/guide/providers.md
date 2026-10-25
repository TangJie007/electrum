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
| `@Optional()` | token **能解析**才注入，否则跳过该字段（不抛错）；Class token 即使没进 `providers` 也会按类构造 |
| `@WindowRef(name)` | 注入名为 `name` 的 `BrowserWindow` |

## 自定义 Provider

除了直接写类（`providers: [UserService]`），还支持三种对象形态。统一写法：`provide` 是注入时用的 **token**，后面跟「怎么造出值」。

| 形态 | 写法 | 适合场景 |
|------|------|----------|
| 类 | `UserService` | 日常 Service / 可注入类 |
| `useValue` | `{ provide, useValue }` | 常量、配置对象、已有实例 |
| `useClass` | `{ provide, useClass }` | 接口 token ↔ 实现类、测试替换 |
| `useFactory` | `{ provide, useFactory, inject? }` | 需要依赖其它 Provider 再组装 |

每种形态都是：**模块里注册 → 字段 `@Inject(token)` → 业务方法里使用**。

### useValue — 直接给值

**场景**：配置常量、开关、第三方已创建好的对象，不想再 `new`。

```ts
// 1. 注册
@Module({
  providers: [
    ApiClient,
    { provide: 'API_URL', useValue: 'https://api.example.com' },
    { provide: 'FEATURE_FLAGS', useValue: { hmr: true, dark: false } },
  ],
})
export class AppModule {}

// 2. 注入并使用
@Injectable()
export class ApiClient {
  @Inject('API_URL')
  apiUrl!: string

  @Inject('FEATURE_FLAGS')
  flags!: { hmr: boolean; dark: boolean }

  fetchUsers() {
    if (!this.flags.hmr) console.log('HMR off')
    return fetch(`${this.apiUrl}/users`) // 用上注入的常量
  }
}
```

`resolve` 时直接返回该值（默认按 singleton 缓存）。

### useClass — token 与实现类分离

**场景**：用抽象 / 字符串 token 注入，实现可替换（开发用 Mock、生产用真实现）。

```ts
// 1. 抽象 + 实现
abstract class Storage {
  abstract read(key: string): string
}

@Injectable()
class FileStorage extends Storage {
  read(key: string) {
    return `file:${key}`
  }
}

@Injectable()
class MemoryStorage extends Storage {
  private data = new Map<string, string>()
  read(key: string) {
    return this.data.get(key) ?? ''
  }
}

// 2. 注册：token 是 Storage，真正 new 的是 FileStorage
@Module({
  providers: [
    SettingsService,
    { provide: Storage, useClass: FileStorage },
    // 测试时可换成：{ provide: Storage, useClass: MemoryStorage }
  ],
})
export class AppModule {}

// 3. 注入并使用（业务只依赖抽象，不关心具体类）
@Injectable()
export class SettingsService {
  @Inject(Storage)
  storage!: Storage

  getTheme() {
    return this.storage.read('theme') // 实际调用 FileStorage.read
  }
}
```

效果等价于「用 `Storage` 当 token，内部 `new FileStorage()` 再走属性注入」。

### useFactory — 工厂组装

**场景**：创建逻辑依赖其它 Provider，或要读环境变量 / 做条件分支后再返回。

```ts
// 1. 注册（可无 inject，也可 inject 其它 token）
@Module({
  providers: [
    ConfigService,
    BannerService,
    {
      provide: 'APP_CONFIG',
      useFactory: () => ({
        appName: 'Electrum Demo',
        version: '0.1.0',
      }),
    },
    {
      provide: 'BANNER',
      inject: ['APP_CONFIG'],
      useFactory: (cfg: { appName: string; version: string }) =>
        `=== ${cfg.appName} v${cfg.version} ===`,
    },
  ],
})
export class AppModule {}

// 2. 注入并使用工厂产物
@Injectable()
export class ConfigService {
  @Inject('APP_CONFIG')
  config!: { appName: string; version: string }

  get appName() {
    return this.config.appName // 使用工厂返回的对象
  }
}

@Injectable()
export class BannerService {
  @Inject('BANNER')
  banner!: string

  print() {
    console.log(this.banner) // === Electrum Demo v0.1.0 ===
  }
}
```

- `inject`：工厂参数对应的 token 列表，`resolve` 时先解析再传入  
- 无 `inject` 时工厂无参调用（如上例 `APP_CONFIG`）

仓库 `examples/basic` 中 `ConfigModule` 的 `'APP_CONFIG'` 工厂 + `ConfigService` 的 `@Inject('APP_CONFIG')` 就是这条链路（`ConfigModule` 标了 `@Global()`，所以 `FileModule` 不用 imports 也能注入配置）。

### useFactory — 异步工厂

工厂可以返回 Promise（读文件、连数据库、拉远程配置都行）：

```ts
@Module({
  providers: [
    {
      provide: 'DB',
      inject: ['DB_PATH'],
      useFactory: async (dbPath: string) => {
        const db = await connect(dbPath)
        return db
      },
    },
  ],
})
export class AppModule {}
```

要点：

- **启动期自动等待**：`createApp(AppModule).start()` 内部用 `resolveAsync` 解析 Controller，异步工厂会被 `await`，不会出现「Controller 拿到未完成的 Promise」。
- **手动取用走异步接口**：`app.resolveAsync('DB')`；对含异步工厂的 token 调同步 `app.resolve('DB')` 会直接抛错并提示改用 `resolveAsync`，不会静默产出第二个实例。
- **并发只构造一次**：同一 singleton token 的并发 `resolveAsync` 共享同一个 Promise；`transient` 不参与去重，每次解析都是新实例。
- **工厂的 `inject` 列表同样检测环**：`A.inject=[B]` / `B.inject=[A]` 会报 `Circular dependency detected: A → B → A`，而不是栈溢出或死锁。

### 怎么选

```
只要 new 一个类？           → 直接写类，或 useClass
已经是现成值？             → useValue
要先拿到别的依赖再组装？   → useFactory + inject
```

## 作用域

通过 `@Injectable({ scope })` 控制实例生命周期：

| Scope | 行为 |
|-------|------|
| `'singleton'`（默认） | 首次 `resolve` 后缓存，之后复用同一实例 |
| `'transient'` | 每次 `resolve` 都 `new` + 属性注入，不缓存 |
| `'request'` | 每次请求一个实例；注入到单例时拿到的是**代理**，访问时才落到当前请求 |

```ts
@Injectable()
class FileService {} // 默认 singleton，应用内一份

@Injectable({ scope: 'transient' })
class RequestContext {} // 每次 resolve 都是新实例

@Injectable({ scope: 'request' })
class AuditContext {
  traceId = crypto.randomUUID()
  dispose() {
    /* 本次请求结束时的清理：关连接、清临时文件 */
  }
}
```

ModuleScanner 注册类 Provider 时会读出 `scope`，再传给 `container.register`。日常 Service / Controller 用默认单例即可。

注意：若 **transient** 服务只被注入到 **singleton** Controller，通常在第一次 resolve 该 Controller 时创建一次，并挂在那一个 Controller 上——不会「每次 IPC 都 new」。需要按请求新建时，应在每次调用路径上主动 `resolve`（或自行工厂），而不是只依赖字段注入。

### request 作用域怎么用

`@IpcHandle` / `@IpcOn` / `@AppEvent` 的每次调用**已经自动**包了一层请求作用域，正常写业务代码感知不到它的存在：

```ts
@Injectable({ scope: 'request' })
class AuditContext {
  traceId = crypto.randomUUID()
}

@Controller('user')
export class UserController {
  @Inject(AuditContext)
  audit!: AuditContext // 单例 Controller 里拿到的其实是代理

  @IpcHandle('list')
  list() {
    // 同一次 IPC 调用内多次访问，都是同一个 AuditContext 实例
    return { traceId: this.audit.traceId, users: [] }
  }
}
```

需要**手写入口**时才用 `runInRequestScopeAsync`（定时任务、自己注册的 `ipcMain.on`、托盘/菜单回调等 Electrum 没覆盖到的地方）：

```ts
const container = app.getContainer()

setInterval(() => {
  void container.runInRequestScopeAsync(async () => {
    // 这里解析到的 request-scoped Provider 共享同一个实例
    const audit = await container.resolveAsync(AuditContext)
    await syncUsers(audit)
  })
}, 60_000)
```

- 作用域结束时，本次创建的实例会**按创建逆序**销毁（`dispose()` 或 `onDispose()`）。
- 在作用域外访问 request-scoped Provider 会抛 `was accessed outside of a request scope`，这是设计如此，不是 bug。
- ⚠️ 同名的同步版本 `runInRequestScope()` **不会**销毁本次创建的实例，只留给框架内部同步路径使用，业务代码请一律用 `runInRequestScopeAsync()`。

更细的容器行为（作用域、环依赖、销毁顺序）由 `@electrum/core` 的 DI 容器保证。

## 诊断与排错

Provider 类型不匹配、忘写 `providers`、没把 Provider 写进 `exports`，通常都表现为一句「找不到 Provider」或「not visible」。容器提供了两个出口：

```ts
const container = app.getContainer()

// 启动期打一次，确认注册结果与依赖指向
console.log(container.printDependencyGraph())

// 需要结构化数据（自定义渲染 / 断言）时
const nodes = container.getDependencyGraph()
// [{ token: 'UserService', scope: 'singleton', owner: 'UserModule', dependencies: ['Logger'] }]
```

`printDependencyGraph(limit?)` 输出形如：

```
DI dependency graph (12 providers):
  UserService [singleton] @ UserModule
      └─ Logger
  'API_URL' [singleton] @ AppModule
```

其它两点：

- **环依赖**默认直接抛错，错误信息会带上完整链路 `A → B → A`。确实需要互相引用（如双向回调）时，用 `container.setCircularStrategy('resolve')` 复用「已建壳、未填字段」的实例——注意此时拿到对象时部分字段可能还是 `undefined`。
- **销毁**：容器只接管 singleton 的生命周期，`dispose()` 时按创建逆序调用实例的 `dispose()` / `onDispose()`；`transient` 与 `request` 由持有者或请求作用域负责。

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
