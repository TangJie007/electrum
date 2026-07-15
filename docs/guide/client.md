# Client（@electrum/client）

`window.api.invoke('user:list')` 能用，但通道字符串散落各处、可读性一般。`@electrum/client` 在 preload 桥之上再包一层：

- **嵌套调用**：`api.user.list()` → `invoke('user:list')`
- **仍可扁平**：`api.invoke('user:list')`
- **类型参数**：传入你的 `IpcApi` 通道表，获得参数 / 返回值提示

## 安装

```bash
pnpm add @electrum/client
```

无 Electron 依赖，只跑在渲染进程（或带 DOM 的 Vitest）。

## 前置

1. preload 已调用 `@electrum/preload` 的 `exposeApi()`（默认 `window.api`）
2. （推荐）声明通道类型表，例如：

```ts
// ipc-api.ts
export interface IpcApi {
  'app:info': () => Promise<{ name: string; version: string }>
  'user:list': () => Promise<Array<{ id: number; name: string }>>
  'file:read': (path: string) => Promise<string>
}
```

可用 `createApp(...).generateTypes(...)` 生成骨架，再手填精确类型。

## 用法

```ts
import { createClient } from '@electrum/client'
import type { IpcApi } from './ipc-api'

const api = createClient<IpcApi>()

await api.app.info()
await api.user.list()
await api.file.read('/tmp/a.txt')

// 等价扁平写法
await api.invoke('user:list')

api.on('file:saved', (path) => {
  console.log('saved', path)
})

api.send('file:watch', '/tmp/a.txt')
```

规则：Controller 前缀 + Handle 名 → `prefix:channel` → 嵌套成 `api.prefix.channel(...)`。

## 选项

```ts
createClient({
  key: 'api', // 与 exposeApi({ key }) 一致，默认 'api'
})

// 测试时可注入假 bridge，不必挂 window
createClient({
  bridge: {
    invoke: async () => [],
    on: () => () => {},
    send: () => {},
  },
})
```

## 导出

| 导出 | 说明 |
|------|------|
| `createClient` | 创建客户端 |
| `ElectrumClient` / `IpcApiMap` 等 | 类型 |

## 与 Preload 分工

```
渲染  createClient()  ──►  window.api  ◄──  exposeApi()  preload
              │                  │
              │                  └── ipcRenderer.invoke / on / send
              └── api.user.list() → invoke('user:list')
```

| 包 | 跑在哪 | 做什么 |
|----|--------|--------|
| `@electrum/preload` | preload | `contextBridge` + 错误还原 |
| `@electrum/client` | renderer | 调用语法糖 + 类型 |

## 完整示例

见 [`examples/basic/src/renderer/App.vue`](https://github.com/TangJie007/electrum/tree/main/examples/basic/src/renderer/App.vue)：`createClient<IpcApi>()` + `api.user.list()` / `api.file.read()`。

## 下一步

→ [Controllers](./controllers)（通道如何在主进程声明）  
→ [示例项目](./examples)
