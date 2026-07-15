# Getting Started

## Requirements

- Node.js ≥ 18
- [pnpm](https://pnpm.io/) (package manager for this monorepo)
- Electron ≥ 20 (peerDependency)

## Run from This Repository

```bash
# Clone and install
git clone https://github.com/TangJie007/electrum.git
cd electrum
pnpm install

# Build framework packages
pnpm build

# Run unit tests (optional)
pnpm test

# Start the full example (electron-vite)
pnpm dev:example
```

The example app demonstrates Module / Controller / IPC, field injection, declarative windows, global Filter / Interceptor, and a Vue 3 renderer process.

## Minimal Usage

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

Renderer chain:

```ts
// preload
import { exposeApi } from '@electrum/preload'
exposeApi()

// renderer
import { createClient } from '@electrum/client'
const api = createClient<IpcApi>()
await api.hello.greet() // ≡ invoke('hello:greet')
```

## Use in Your Own Electron Project

Development currently centers on the monorepo workspace. In a business project you can temporarily use workspace / local path dependencies:

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

Preload (a complete file is usually just a few lines):

```ts
// src/preload/index.ts
import { exposeApi } from '@electrum/preload'

exposeApi() // → window.api.invoke / on / send
```

Simplify renderer calls with `@electrum/client`:

```ts
import { createClient } from '@electrum/client'

const api = createClient<IpcApi>()
await api.user.list()      // ≡ window.api.invoke('user:list')
await api.file.read(path)  // ≡ window.api.invoke('file:read', path)
```

Recommended main-process entry:

```ts
import { createApp } from '@electrum/core'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = createApp(AppModule)
  await app.start()
}

bootstrap()
```

TypeScript must be configured to support Stage 3 decorators (see `packages/*/tsconfig` and `examples/basic` in the repository).

## Preview These Docs Locally

```bash
pnpm docs:dev
```

## Next Steps

- Learn about Controllers: [Controllers](./controllers)
- Preload / renderer client: [Preload](./preload), [Client](./client)
- Package layout and decorator conventions: [Core Concepts](./concepts)
- Full example reference: [Example Project](./examples)
