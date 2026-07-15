# Pipe

Pipe 负责**变换（或校验）业务参数**：在 Guard 通过之后、Interceptor / 业务方法之前，对 `invoke` 传入的载荷做 `transform`。

当前实现约定：**依次变换 `args[0]`**（多参数时后几个原样保留）。设计假设主业务载荷放在第一个参数。

Pipe **不**决定能不能进（那是 [Guard](./guards)）、**不**包装整个调用（那是 [Interceptor](./interceptors)）。

总览见 [中间件管道](./middleware)。

## 接口

```ts
import type { PipeTransform, IpcContext } from '@electrum/common'

transform(value: any, context: IpcContext): any | Promise<any>
```

- `value`：当前的 `args[0]`（上一 Pipe 的输出会成为下一 Pipe 的输入）
- `context`：同 Guard，含 `channel` / `event` / `args` 等

校验失败时抛 `ValidationException`（或其它 `ElectronException`），由 [Filter](./filters) 回传渲染进程。

## 挂载

```ts
import { Injectable, UsePipes, Controller, IpcHandle, ValidationException } from '@electrum/common'
import type { PipeTransform, IpcContext } from '@electrum/common'

@Injectable()
export class ParseIntPipe implements PipeTransform {
  transform(value: any, _ctx: IpcContext) {
    const n = Number(value)
    if (!Number.isInteger(n)) {
      throw new ValidationException('id must be an integer', [{ field: 'id', value }])
    }
    return n
  }
}

@Controller('user')
export class UserController {
  @UsePipes(ParseIntPipe)
  @IpcHandle('get')
  get(id: number) {
    return { id }
  }
}
```

也可类级 `@UsePipes(...)`，或 `app.useGlobalPipes(...)`。合并顺序：**global → class → method**。

## 使用场景

### 1. 类型强制：字符串 / 脏数据 → 安全类型

渲染进程常传来 JSON 数字、字符串混用。Pipe 在进 Service 前统一成 `number` / `boolean`。

```ts
@Injectable()
export class ParseIntPipe implements PipeTransform {
  transform(value: any) {
    const n = Number(value)
    if (!Number.isFinite(n)) {
      throw new ValidationException('expected a number', [{ value }])
    }
    return Math.trunc(n)
  }
}
```

### 2. DTO 整形与默认值

把松散对象收成稳定结构，补默认字段，避免 Controller 里一堆 `data?.x ?? ''`。

```ts
@Injectable()
export class CreateUserPipe implements PipeTransform {
  transform(value: any) {
    if (!value || typeof value !== 'object') {
      throw new ValidationException('body required', [])
    }
    return {
      name: String(value.name ?? '').trim() || 'New User',
      email: String(value.email ?? '').trim().toLowerCase(),
    }
  }
}

@UsePipes(CreateUserPipe)
@IpcHandle('create')
create(data: { name: string; email: string }) {
  return this.users.create(data)
}
```

### 3. 字段校验（格式 / 必填）

集中做邮箱、路径、枚举等校验；失败抛 `ValidationException`，`details` 可带字段级错误列表。

```ts
@Injectable()
export class EmailPipe implements PipeTransform {
  transform(value: any) {
    const email = typeof value === 'string' ? value : value?.email
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ValidationException('invalid email', [{ field: 'email', email }])
    }
    return typeof value === 'string' ? email : { ...value, email }
  }
}
```

### 4. 路径规范化 / 安全清洗

文件类 IPC 里，把相对路径、`..`、别名解析成绝对路径，或限制在 `userData` 内（业务仍应再校验，Pipe 负责「形状正确」）。

```ts
import { join } from 'node:path'
import { app } from 'electron'

@Injectable()
export class UserDataPathPipe implements PipeTransform {
  transform(value: any) {
    const rel = String(value ?? '')
    const root = app.getPath('userData')
    const full = join(root, rel)
    if (!full.startsWith(root)) {
      throw new ValidationException('path escapes userData', [{ rel }])
    }
    return full
  }
}
```

### 5. 多 Pipe 串联

global / class / method 上的 Pipe 按顺序依次 `transform`，适合「先 Parse → 再 Validate → 再 Normalize」。

```ts
@UsePipes(ParseIntPipe, PositiveIdPipe)
@IpcHandle('get')
get(id: number) { /* id 已是正整数 */ }
```

## 与其它中间件的边界

| 需求 | 用 |
|------|----|
| 能不能调用 | [Guard](./guards) |
| 参数怎么变成合法形状 | **Pipe** |
| 打点、计时、改返回值 | [Interceptor](./interceptors) |
| 异常怎么回给渲染进程 | [Filter](./filters) |

## 下一步

→ [Interceptor](./interceptors)  
← [Guard](./guards) · [中间件管道](./middleware)
