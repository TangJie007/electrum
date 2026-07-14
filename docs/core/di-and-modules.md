# 模块扫描与依赖注入

对应源码：

- `packages/core/src/module/scanner.ts` — 详细设计见 [ModuleScanner 设计说明](./module-scanner.md)
- `packages/core/src/di/container.ts`

## 1. ModuleScanner：把模块树变成「已注册表」

### 输入 / 输出

- **输入**：根 `AppModule` 类（必须有 `@Module`）
- **输出**：`ScannedModule[]`，且副作用：所有 Provider/Controller 已 `container.register(...)`

```ts
export interface ScannedModule {
  moduleClass: Function
  metadata: ModuleMetadata
  controllers: Function[]
  providers: Function[]      // 类 Provider 列表（含 useClass）
  declarations: Function[]   // 窗口声明类
}
```

### walk 算法（DFS）

```
walk(M):
  if visited(M): return
  mark visited
  meta = readMetadata(M, META.MODULE)   // 没有就抛错
  for imp in meta.imports: walk(imp)      // 先子模块
  注册 meta.providers
  注册 meta.controllers（useClass = 自身）
  results.push(ScannedModule)
```

要点：

1. **先 imports 再自己**：导入模块的 Provider 先入容器。  
2. **visited**：避免循环 import 死递归。  
3. Provider 形态支持四种（与 Nest 类似）：

| 写法 | 注册行为 |
|------|----------|
| `FooService`（函数/类） | `useClass: FooService`，scope 来自 `@Injectable` |
| `{ provide, useValue }` | 直接用值 |
| `{ provide, useClass }` | 别名/替换实现 |
| `{ provide, useFactory, inject }` | 工厂，先 resolve inject 列表 |

> Provider 一律注册进**同一个**全局 `DIContainer`，注册后任意模块均可 `@Inject`（无 Nest 式 exports 边界）。

## 2. DIContainer：无参 new + 字段注入

Stage 3 装饰器没有参数装饰器 / `design:paramtypes`，所以 **不用构造函数注入**。

Resolve 一个类时的步骤：

```
resolve(token)
  1. 若是 electrum:window:* Symbol → 走 windowProvider
  2. 若已有 singleton 缓存 → 直接返回
  3. 若 token 在 resolving 集合 → 环依赖，抛错（附解析链）
  4. useValue / useFactory 分支
  5. new TargetClass()                         // 无参
  6. 读 META.INJECTIONS
       - type=service  → resolve(token) 赋到字段
       - type=window   → windowProvider(name)
       - type=optional → has(token) 才注入
  7. singleton 则缓存
  8. finally：从 resolving 删掉 token
```

对应业务代码：

```ts
@Injectable()
class FileService { ... }

@Controller('file')
class FileController {
  @Inject(FileService)
  file!: FileService   // resolve 时被赋值
}
```

`@Inject` / `@WindowRef` / `@Optional` 只是在 **编译期/装饰器求值时** 往 `Symbol.metadata` 里推一条 `InjectionPoint`；真正赋值发生在 `DIContainer.resolve`。

## 3. Scope

| Scope | 行为 |
|-------|------|
| `singleton`（默认） | 首次 resolve 后进 `singletons` Map |
| `transient` | 每次 `new` + 注入，不缓存 |

来源：`@Injectable({ scope: 'transient' })`，由 Scanner 读出后传入 `register`。

## 4. 窗口 Token

`@WindowRef('main')` 写入的 token 形如：

```ts
Symbol.for('electrum:window:main')
```

`resolve` 遇到这种 Symbol 不会查 `providers`，而是：

```ts
this.windowProvider(windowName)
```

`WindowManager.initialize` 开始时会：

```ts
this.container.setWindowProvider((name) => this.getWindow(name))
```

因此 **窗口必须先创建**，再 resolve 依赖窗口的 Controller。

## 5. 调试建议

1. 在 `ModuleScanner.walk` 末尾打 `console.log(moduleClass.name, metadata)` 看树。  
2. 环依赖故意造 `A→B→A`，看报错里的链格式。  
3. 对照 `packages/core/src/__tests__/metadata.spec.ts`：验证装饰器元数据是否写对（在 common 层）；DI 行为可另写容器单测。

下一篇：[IPC 桥接与中间件](./ipc-and-middleware.md)
