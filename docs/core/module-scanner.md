# ModuleScanner 设计说明

源码：`packages/core/src/module/scanner.ts`  
关联：`@Module`（`packages/common/src/decorators/module.decorator.ts`）、`DIContainer`、`Application.start()`

## 1. 解决什么问题

业务用 `@Module({ imports, controllers, providers, declarations })` **声明**结构；  
`ModuleScanner` 负责在运行时：

1. 读出 `META.MODULE` 元数据  
2. 展开 `imports` 模块树  
3. 把 Provider / Controller **注册进**同一个 `DIContainer`  
4. 产出 `ScannedModule[]`，供 IPC / 窗口 / 生命周期继续使用  

不做：实例化业务对象（那是 `container.resolve`）、不绑 `ipcMain`。

## 2. 在启动链路中的位置

```
createApp(AppModule).start()
  │
  ├─ ModuleScanner.scan(AppModule)   ← 本模块
  │     · 注册所有 providers / controllers
  │     · 返回 scannedModules
  ├─ app.whenReady()
  ├─ WindowManager.initialize(scannedModules)   // 用 declarations
  ├─ IpcBridge.registerAll(scannedModules)      // 用 controllers
  └─ LifecycleManager(... scannedModules)
```

## 3. 算法：DFS + visited

```
walk(M):
  if M in visited: return
  add M to visited
  meta = readMetadata(M, META.MODULE)   // 无 @Module → throw
  for child in meta.imports:
    walk(child)                         // 先子后己
  register each meta.providers
  register each meta.controllers
  results.push(ScannedModule)
```

| 设计点 | 原因 |
|--------|------|
| **先 imports 再本模块** | 依赖模块的 Provider 先入容器，本模块 resolve 时才能找到 |
| **visited** | 避免环状 import 死循环 |
| **results 顺序** | 子模块在前：与 DFS 完成顺序一致，便于理解依赖 |

示例（basic）：

```
AppModule
  imports: [WindowModule, FileModule]
  → 先 walk(WindowModule)、walk(FileModule)
  → 再注册 AppModule 自己的 controllers/providers
```

## 4. Provider 四种形态

与 Nest 对齐，由 `registerProvider` 处理：

| 写法 | 注册方式 |
|------|----------|
| `FileService`（类） | `token=FileService`, `useClass`, scope 来自 `@Injectable` |
| `{ provide, useValue }` | 常量 / 配置对象 |
| `{ provide, useClass }` | Token 与实现类分离 |
| `{ provide, useFactory, inject? }` | 工厂；resolve 时先解析 `inject` 列表 |

仅「类 / useClass」会进入 `ScannedModule.providers`（供生命周期遍历类实例）。  
`useValue` / `useFactory` 只注册到容器，不一定出现在 `providers` 数组。

## 5. Controller 为何也要 register

`IpcBridge` 会：

```ts
const instance = this.container.resolve(controllerClass)
```

Controller 上常有 `@Inject` / `@WindowRef`。  
所以 Scanner 把 Controller 以 `useClass: controller` 注册，与 Provider 一样走属性注入。

## 6. ScannedModule 字段用途

| 字段 | 下游消费者 |
|------|------------|
| `controllers` | `IpcBridge`、`LifecycleManager`、`EventBridge` |
| `providers` | `LifecycleManager`、`EventBridge`（类实例钩子 / AppEvent） |
| `declarations` | `WindowManager`（`@WindowDeclaration`） |
| `metadata` | 保留原始 `@Module` 配置 |

## 7. 已知限制（读 Spec / 后续演进）

- **全局 DI**：所有模块的 Provider 注册到**同一个**容器，注册后全局可注入（无模块级可见性边界）。  
- **环依赖模块**：靠 `visited` 跳过，不会二次注册；业务环依赖实例化仍由 `DIContainer` 检测。  
- Scanner **可重复 scan**：`Application.reload` 会 `container.clear()` 后新建 Scanner，避免脏状态。

## 8. 对照阅读

1. 源码旁注释：`scanner.ts`  
2. 元数据写入：`@Module` in common  
3. 注册之后如何解析：`di/container.ts`、[模块扫描与 DI](./di-and-modules.md)  
4. 示例树：`examples/basic/src/main/app.module.ts`
