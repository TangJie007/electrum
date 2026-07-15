# Preload（@electrum/preload）

渲染进程不能直接碰 Node / Electron 主 API。安全做法是：在 **preload** 里用 `contextBridge` 暴露一小段桥，再给渲染用。

`@electrum/preload` 封装与 Electrum 主进程配套的这段桥，避免每个项目手写 `invoke` / `__error` 还原。

## 安装

```bash
pnpm add @electrum/preload
# peer: electron >= 20
```

## 用法

```ts
// src/preload/index.ts
import { exposeApi } from '@electrum/preload'

exposeApi()
```

默认会挂到 `window.api`：

| 方法 | 作用 |
|------|------|
| `invoke(channel, ...args)` | 请求-响应（对应 `@IpcHandle`）；若主进程返回 `{ __error: true }`，会抛出 `IpcError` |
| `on(channel, listener)` | 订阅主进程推送；返回取消订阅函数 |
| `send(channel, ...args)` | 单向消息（对应 `@IpcOn`） |

自定义挂载名：

```ts
exposeApi({ key: 'electrum' }) // → window.electrum
```

## 错误约定

主进程 Filter / 管道失败时，Handle 通道通常返回：

```ts
{
  __error: true,
  code: string,
  message: string,
  details?: unknown
}
```

`exposeApi` 的 `invoke` 会识别该形状并 `throw new IpcError(code, message, details)`，渲染侧可用 `try/catch` 处理。

## 与窗口声明

窗口的 `webPreferences.preload` 需指向编译后的 preload 脚本，例如：

```ts
@WindowDeclaration({
  name: 'main',
  options: {
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  },
  // ...
})
export class MainWindow {}
```

## 导出

| 导出 | 说明 |
|------|------|
| `exposeApi` | 注册 `window` 桥 |
| `IpcError` | 渲染侧错误类 |
| `isIpcErrorPayload` | 判断是否为 `__error` 载荷 |

## 配套

- 渲染侧更易用的调用封装：[Client](./client)
- IPC 控制器：[Controllers](./controllers)
- 完整示例：`examples/basic/src/preload/index.ts`

## 下一步

→ [Client](./client)
