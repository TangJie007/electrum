# 模块扫描与注册

`AppModule` 声明「有哪些 Controller / Provider」，框架不会魔法发现文件，只认 `@Module({...})`。

## 示例声明

```ts
// examples/basic/src/main/app.module.ts
@Module({
  imports: [WindowModule, FileModule, UserModule],
  controllers: [AppController],
  providers: [
    ConfigService,
    {
      provide: 'APP_CONFIG',
      useFactory: () => ({
        appName: 'Electrum Admin',
        version: '0.1.0',
      }),
    },
  ],
})
export class AppModule {}
```

## 代码路径

```
Application.start()
  → new ModuleScanner(container)
  → scanner.scan(AppModule)
       → walk(AppModule)
            → 先 walk(imports...)     // DFS：子模块 Provider 先注册
            → registerProvider(每个 provider)
            → container.register(每个 controller, { useClass })
            → 推入 scannedModules
```

源码：`packages/core/src/module/scanner.ts`。

## register 时发生了什么

`register` **只往 `providers` Map 记账，不 `new`**：

| 模块里写的 | 容器里记的 |
|------------|------------|
| `ConfigService` | `token=ConfigService, useClass=ConfigService` |
| `{ provide: 'APP_CONFIG', useFactory }` | `token='APP_CONFIG', useFactory, inject?` |
| `controllers: [AppController]` | `token=AppController, useClass=AppController` |

实例要等到后面 `resolve(AppController)` / `resolve(ConfigService)` 才创建。

## Controller 为何也要 register

`IpcBridge.registerController` 里会：

```ts
const instance = this.container.resolve(controllerClass)
```

若不进容器，就无法做属性注入（`@Inject` / `@IpcEmit` 等）。

## 小结

扫描 = 读 `@Module` 树 + `DIContainer.register`。  
注入与绑 IPC 都发生在扫描之后。下一篇：[@Inject 注入路径](./inject)。
