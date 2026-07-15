# 依赖注入

Electrum 的 DI **不用构造函数参数注入**（Stage 3 装饰器没有参数装饰器那条成熟路径），采用 **属性注入**：字段上标记 `@Inject`，`resolve` 时再赋值。

## 心智模型

```
装饰器不注入，只写「字段 X 需要 token Y」
register 不创建对象，只登记配方
resolve 才干活：new Cls() → 读 @Inject → 递归 resolve → 赋到字段
```

```ts
import { Injectable, Inject } from '@electrum/common'

@Injectable()
class Logger {
  log(msg: string) {
    console.log(msg)
  }
}

@Injectable()
class UserService {
  @Inject(Logger)
  logger!: Logger

  list() {
    this.logger.log('list users')
    return []
  }
}
```

在模块里声明 `providers: [Logger, UserService]` 后，扫描阶段会 `register`；IPC 绑定或生命周期触发时 `resolve`，`logger` 才有值。

## 常用装饰器

| 装饰器 | 用途 |
|--------|------|
| `@Injectable()` | 标记可注入类（惯例；便于与 Nest 对齐） |
| `@Inject(token)` | 字段注入；token 可以是类或字符串 / symbol |
| `@Optional()` | 解析失败时不抛错（配合可选依赖） |
| `@WindowRef(name)` | 注入名为 `name` 的 `BrowserWindow` |

## 作用域

当前默认按容器内单例持有已 resolve 实例（与核心容器行为一致）。业务侧不要假设「每次 IPC 都 new 一个 Service」。

## 手动理解 DI

仓库提供教学向示例 [`examples/di`](https://github.com/TangJie007/electrum/tree/main/examples/di)，用最少代码重写 polyfill → metadata → injectable → inject → container，并带冒烟测试：

```bash
cd examples/di
pnpm demo
pnpm start
```

完整应用里不需要手写 `container.register`；`@Module` + `ModuleScanner` 会替你完成批量注册。

## 下一步

→ [IPC 通信](./ipc)
