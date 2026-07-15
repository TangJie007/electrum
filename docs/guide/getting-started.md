# 快速开始

## 环境要求

- Node.js ≥ 18
- [pnpm](https://pnpm.io/)（本仓库 monorepo 包管理器）
- Electron ≥ 20（peerDependency）

## 从本仓库跑起来

```bash
# 克隆并安装
git clone https://github.com/TangJie007/electrum.git
cd electrum
pnpm install

# 构建框架包
pnpm build

# 跑单元测试（可选）
pnpm test

# 启动完整示例（electron-vite）
pnpm dev:example
```

示例应用展示了 Module / Controller / IPC、字段注入、声明式窗口、全局 Filter / Interceptor，以及 Vue 3 渲染进程。

## 最小用法

```ts
import {
  Module,
  Controller,
  IpcHandle,
  Injectable,
  Inject,
} from '@electrum/common'
import { createApp } from '@electrum/core'

@Injectable()
class HelloService {
  greet() {
    return 'hello'
  }
}

@Controller('hello')
class HelloController {
  @Inject(HelloService)
  hello!: HelloService

  @IpcHandle('greet')
  greet() {
    return this.hello.greet()
  }
}

@Module({
  controllers: [HelloController],
  providers: [HelloService],
})
class AppModule {}

await createApp(AppModule).start()
```

渲染链路：

```ts
// preload
import { exposeApi } from '@electrum/preload'
exposeApi()

// renderer
import { createClient } from '@electrum/client'
const api = createClient<IpcApi>()
await api.hello.greet() // ≡ invoke('hello:greet')
```

## 在自己的 Electron 项目中使用

当前以 monorepo workspace 开发为主。在业务项目中可暂时用 workspace / 本地 path 依赖：

```json
{
  "dependencies": {
    "@electrum/common": "workspace:*",
    "@electrum/core": "workspace:*",
    "@electrum/preload": "workspace:*",
    "@electrum/client": "workspace:*"
  }
}
```

Preload（完整文件通常只需几行）：

```ts
// src/preload/index.ts
import { exposeApi } from '@electrum/preload'

exposeApi() // → window.api.invoke / on / send
```

渲染进程用 `@electrum/client` 简化调用：

```ts
import { createClient } from '@electrum/client'

const api = createClient<IpcApi>()
await api.user.list()      // ≡ window.api.invoke('user:list')
await api.file.read(path)  // ≡ window.api.invoke('file:read', path)
```

主进程入口推荐：

```ts
import { createApp } from '@electrum/core'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = createApp(AppModule)
  await app.start()
}

bootstrap()
```

TypeScript 需启用支持 Stage 3 装饰器的配置（见仓库内 `packages/*/tsconfig` 与 `examples/basic`）。

## 本地预览本文档

```bash
pnpm docs:dev
```

## 下一步

- 了解 Controllers：[Controllers](./controllers)
- Preload / 渲染客户端：[Preload](./preload)、[Client](./client)
- 分包与装饰器约定：[核心概念](./concepts)
- 对照完整示例：[示例项目](./examples)
