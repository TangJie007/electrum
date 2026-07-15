# Pipe

Pipes are responsible for **transforming (or validating) business parameters**: after a Guard passes, and before Interceptors / business methods run, they `transform` the payload passed to `invoke`.

Current implementation convention: **transform `args[0]` in sequence** (additional parameters are kept as-is). The design assumes the primary business payload is the first argument.

Pipes **do not** decide access (that is [Guard](./guards)), and **do not** wrap the entire call (that is [Interceptor](./interceptors)).

See [Middleware Pipeline](./middleware) for an overview.

## Interface

```ts
import type { PipeTransform, IpcContext } from '@electrum/common'

transform(value: any, context: IpcContext): any | Promise<any>
```

- `value`: current `args[0]` (output of the previous Pipe becomes input to the next)
- `context`: same as Guard, including `channel` / `event` / `args`, etc.

On validation failure, throw `ValidationException` (or another `ElectronException`); [Filter](./filters) returns it to the renderer process.

## Mounting

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

You can also use class-level `@UsePipes(...)`, or `app.useGlobalPipes(...)`. Merge order: **global → class → method**.

## Use Cases

### 1. Type Coercion: String / Dirty Data → Safe Types

The renderer often sends mixed JSON numbers and strings. Pipes normalize to `number` / `boolean` before Services run.

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

### 2. DTO Shaping and Defaults

Turn loose objects into stable structures and fill default fields, avoiding `data?.x ?? ''` scattered in Controllers.

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

### 3. Field Validation (Format / Required)

Centralize email, path, enum, and similar checks; on failure throw `ValidationException` with field-level errors in `details`.

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

### 4. Path Normalization / Safe Sanitization

In file-related IPC, resolve relative paths, `..`, and aliases to absolute paths, or restrict to `userData` (business logic should still validate; Pipes ensure "correct shape").

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

### 5. Chaining Multiple Pipes

Pipes on global / class / method run `transform` in order—good for "Parse → Validate → Normalize".

```ts
@UsePipes(ParseIntPipe, PositiveIdPipe)
@IpcHandle('get')
get(id: number) { /* id is already a positive integer */ }
```

## Boundaries with Other Middleware

| Need | Use |
|------|----|
| Whether the call is allowed | [Guard](./guards) |
| How parameters become valid shape | **Pipe** |
| Logging, timing, return value wrapping | [Interceptor](./interceptors) |
| How exceptions reach the renderer | [Filter](./filters) |

## Next Steps

→ [Interceptor](./interceptors)  
← [Guard](./guards) · [Middleware Pipeline](./middleware)
