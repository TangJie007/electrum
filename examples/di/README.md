# examples/di — 从零理解 Electrum 的依赖注入

这不是「怎么用 `@electrum/core`」的用法示例，而是把 **core 里 DI 那条主路径** 用最少代码重写一遍，帮你看清机制。

真正用法见：`examples/basic`。正式实现见：

| 本示例 | `@electrum/core` / `@electrum/common` |
|--------|----------------------------------------|
| `01-polyfill.ts` | `packages/common/src/polyfill.ts` |
| `02-metadata.ts` | `packages/common/src/constants/metadata-keys.ts` |
| `03-injectable.ts` | `packages/common/src/decorators/injectable.decorator.ts` |
| `04-inject.ts` | `packages/common/src/decorators/inject.decorator.ts` |
| `05-container.ts` | `packages/core/src/di/container.ts` |
| `06-smoke.ts` | 行为对照测试 |
| `demo.ts` | **怎么用**：业务类 + register + resolve |

## 核心结论（先记住这三句）

1. **装饰器不注入**，只往 `Symbol.metadata` 写「字段 X 需要 token Y」。
2. **`register` 不创建对象**，只登记配方（useClass / useValue / useFactory）。
3. **`resolve` 才干活**：`new Cls()` → 读 `@Inject` → 递归 `resolve` → 赋到字段。

Electrum **不用构造函数注入**（Stage 3 没有参数装饰器那条路），用的是 **属性注入**：

```ts
@Injectable()
class UserService {
  @Inject(Logger)
  logger!: Logger   // resolve 之后才有值
}
```

## 心智模型

```
没有 DI：
  logger = new Logger()
  users = new UserService()
  users.logger = logger          // 调用方自己接线

有 DI：
  container.register(Logger, { useClass: Logger })
  container.register(UserService, { useClass: UserService })
  users = container.resolve(UserService)
  // 容器内部：new UserService() → users.logger = resolve(Logger)
```

DI 解决的是：**「谁依赖谁」写在类旁边，由容器统一接线**，业务代码不再到处 `new`。

## 与完整 core 的差距（刻意砍掉）

本示例保留主路径；下面这些在 core 里有，这里没有：

- `@Module` + `ModuleScanner`（扫树并批量 `register`）
- `@WindowRef` / `@Optional`
- Controllers / IPC（resolve 之后挂 bridge）

完整链路是：`createApp(AppModule)` → `ModuleScanner.scan` 注册 → 各子系统 `container.resolve(...)`。

## 怎么跑

```bash
cd examples/di
pnpm demo    # 用法演示（看 console 输出）
pnpm start   # 冒烟测试
```
