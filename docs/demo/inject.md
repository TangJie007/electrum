# @Inject 注入路径

以 `AppController` 上的字段为例：

```ts
// examples/basic/src/main/app.controller.ts
@Inject(ConfigService)
config!: ConfigService
```

目标：搞清 **`config` 何时从 `undefined` 变成 `ConfigService` 实例**。

## 阶段一：装饰器记账（类加载时）

`@Inject(ConfigService)` 在 `packages/common` 里只做一件事——往 `AppController` 的 `Symbol.metadata` 推一条：

```ts
{
  propertyKey: 'config',
  token: ConfigService,  // 类本身当 token
  type: 'service',
}
```

此时 **没有** `new ConfigService()`，也没有给 `config` 赋值。`!` 只是告诉 TypeScript「后面会有值」。

`ConfigService` 自身还有一层注入：

```ts
// config.service.ts
@Inject('APP_CONFIG')
config!: AppConfig
```

同样只写 metadata，token 是字符串 `'APP_CONFIG'`。

## 阶段二：模块扫描 register（start 早期）

`AppModule.providers` 含 `ConfigService` 和工厂 `'APP_CONFIG'` → `ModuleScanner` 调用：

```ts
container.register(ConfigService, { useClass: ConfigService })
container.register('APP_CONFIG', { useFactory: () => ({ ... }) })
container.register(AppController, { useClass: AppController })
```

仍只记账，**还不 resolve**。详见 [模块扫描与注册](./module-scanner)。

## 阶段三：resolve 时真正赋值

触发点通常是 `IpcBridge.registerController`：

```ts
const instance = this.container.resolve(AppController)
```

`DIContainer.resolve`（`packages/core/src/di/container.ts`）路径：

```
resolve(AppController)
  ├─ new AppController()                    // config 仍是空
  ├─ 读 META.INJECTIONS
  ├─ injection: { propertyKey: 'config', token: ConfigService }
  └─ instance.config = resolve(ConfigService)
         ├─ new ConfigService()
         ├─ 读 ConfigService 的 INJECTIONS
         └─ instance.config = resolve('APP_CONFIG')
                └─ useFactory() → { appName, version }
```

对应核心代码逻辑：

```ts
const instance = new (targetClass)()
const injections = readMetadata(targetClass, META.INJECTIONS) || []
for (const injection of injections) {
  // type === 'service' 时：
  instance[injection.propertyKey] = this.resolve(injection.token)
}
```

之后 `getInfo()` 里 `this.config.appName` 才能用。

## 单例

默认 `scope: 'singleton'`。同一容器内：

- 多次 `resolve(ConfigService)` → 同一实例
- `AppController.config` 与单独 `resolve(ConfigService)` → 同一引用

## 和构造注入的区别

Stage 3 原生装饰器 **没有** 可靠的构造参数注入；Electrum 统一用 **属性注入**：先无参 `new`，再按 metadata 填字段。

## 小结

| 时机 | 动作 |
|------|------|
| 类求值 | `@Inject` 写 metadata |
| `scan` | `register` Provider / Controller |
| `resolve(Controller)` | `new` + 递归 `resolve(token)` + 赋字段 |

下一篇：业务方法如何挂到 IPC → [@IpcHandle 绑定路径](./ipc-handle)。
