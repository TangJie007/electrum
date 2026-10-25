# ModuleScanner 设计

源码：`packages/core/src/module/scanner.ts`
相关：`@Module`（`packages/common/src/decorators/module.decorator.ts`）、`DIContainer`、`Application.start()`
英文版：[module-scanner (en)](../en/core/module-scanner)

## 1. 解决什么问题

应用用 `@Module({ imports, controllers, providers, declarations })` 声明结构，`ModuleScanner` 在运行时：

1. 读 `META.MODULE` 元数据
2. 展开 `imports` 模块树
3. 把 Provider / Controller **注册**进同一个 `DIContainer`
4. 产出 `ScannedModule[]` 供 IPC、窗口、生命周期消费

它**不做**：实例化业务对象（那是 `container.resolve` 的事）、绑 `ipcMain`（那是 `IpcBridge` 的事）。

## 2. 在启动链中的位置

```
createApp(AppModule).start()
  │
  ├─ 1. ModuleScanner.scan(AppModule)      ← 本模块
  │       · 注册 providers / controllers
  │       · 返回 scannedModules
  ├─ 2. await app.whenReady()
  ├─ 3. WindowManager.initialize(scannedModules)   // 用 declarations
  ├─ 4. IpcBridge.registerAll(scannedModules)      // 用 controllers
  ├─ 5. EventBridge.registerAll(scannedModules)    // 用 controllers + providers
  └─ 6. LifecycleManager(scannedModules)
```

扫描在 `whenReady()` **之前**就能跑完——它不碰任何 Electron API，纯内存操作。

## 3. 算法：DFS + visited

```
walk(M):
  if M in visited: return
  add M to visited
  meta = readMetadata(M, META.MODULE)   // 没有 @Module → throw
  for child in meta.imports:
    walk(child)                          // 先递归子模块
  register meta.providers                // 四种形态
  register meta.controllers
  results.push(ScannedModule)
```

| 设计选择 | 原因 |
|----------|------|
| **先 imports 后自身** | 被导入模块的 Provider 先入容器，本模块才能解析到它们 |
| **visited 去重** | 防止 A imports B、B imports A 时死递归 |
| **results 顺序** | 子模块在前、父模块在后（DFS 完成序），依赖关系更好推理 |

以 `examples/basic` 为例：

```
AppModule { imports: [WindowModule, FileModule] }
  → walk(WindowModule)
  → walk(FileModule)
  → 注册 AppModule 自己的 controllers / providers
  → push(AppModule)
```

## 4. 四种 Provider 形态

由 `registerProvider` 处理，对齐 Nest：

| 形态 | 注册方式 |
|------|----------|
| `FileService`（类） | `token = FileService`，`useClass`，scope 取自 `@Injectable` |
| `{ provide, useValue }` | 常量 / 配置对象，无构造过程 |
| `{ provide, useClass }` | token 与实现类分离 |
| `{ provide, useFactory, inject? }` | 工厂；`inject` 列表在 **resolve 时**才逐个解析 |

⚠️ 只有「类 / `useClass`」形态会进入 `ScannedModule.providers`（生命周期要靠它遍历类实例）。
`useValue` / `useFactory` 只进容器，**不出现在 `providers` 数组里**，因此也拿不到 `onModuleInit` 等钩子。

## 5. 为什么 Controller 也要注册

`IpcBridge` 里会：

```ts
const instance = this.container.resolve(controllerClass)
```

Controller 上常有 `@Inject` / `@WindowRef` / `@IpcEmit`，必须走同一条属性注入路径。
所以 Scanner 用 `container.register(controller, { useClass: controller })` 把它也登记进去。

## 6. ScannedModule 字段的消费方

| 字段 | 下游消费者 |
|------|------------|
| `controllers` | `IpcBridge`、`LifecycleManager`、`EventBridge` |
| `providers` | `LifecycleManager`、`EventBridge`（类实例钩子 / `@AppEvent`） |
| `declarations` | `WindowManager`（`@WindowDeclaration`） |
| `metadata` | 保留原始 `@Module` 配置 |

## 7. 已知限制

- **单容器、无模块可见性边界**：所有 Provider 注册进**同一个** `DIContainer`，任意模块都能注入。没有 Nest 式 `exports` 边界，也没有 per-module injector；重复 token 共享同一实例。
- **循环模块 imports**：`visited` 只保证不死递归；实例级的循环依赖仍由 `DIContainer` 的 `resolving` 集合检测并报错。
- **扫描期不实例化**：错误（如缺 Provider）要等到 `resolve` 时才暴露，不会在 `scan()` 阶段报出来。

## 8. 交叉阅读

1. `scanner.ts` 的行内注释
2. 元数据写入：`@Module`（`packages/common/src/decorators/module.decorator.ts`）
3. 注册之后如何解析：`di/container.ts`，见 [@Inject 注入路径](../demo/inject)
4. 示例模块树：`examples/basic/src/main/app.module.ts`
5. 总纲：[设计原则与实现原理 §6](../demo/design-principles)
