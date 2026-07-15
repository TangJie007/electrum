# 窗口与生命周期

窗口与 `app` 事件独立于 Controllers，但仍通过 Module 的 `declarations` 与 `@WindowRef` / `@AppEvent` 接入同一套启动流程。

## 声明式窗口

用 `@WindowDeclaration` 描述 `BrowserWindow`，再放入模块的 `declarations`：

```ts
import { Module, WindowDeclaration } from '@electrum/common'
import { join } from 'node:path'

@WindowDeclaration({
  name: 'main',
  options: {
    width: 960,
    height: 680,
    title: 'Electrum Demo',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  },
  prodFile: join(__dirname, '../renderer/index.html'),
})
export class MainWindow {}

@Module({
  declarations: [MainWindow],
})
export class WindowModule {}
```

启动时：`autoCreate !== false` 的窗口会自动创建。  
开发环境优先加载 `ELECTRON_RENDERER_URL` 或 `devUrl`；生产加载 `prodFile`。

## 注入窗口

```ts
import { WindowRef } from '@electrum/common'
import type { BrowserWindow } from 'electron'

@WindowRef('main')
mainWin!: BrowserWindow
```

窗口尚未创建或不存在时，resolve 会失败——框架启动顺序是 **先窗后 IPC**。

## WindowManager 常用能力

通过 `createApp` 拿到的 `Application` 可取管理器：

```ts
import { createApp } from '@electrum/core'
import { AppModule } from './app.module'

const app = createApp(AppModule)
await app.start()

const wm = app.getWindowManager()
```

| 能力 | 用途 |
|------|------|
| `getWindow(name)` | 取单个窗口（默认 `main`） |
| `getAllWindows()` | 当前所有由管理器登记的窗口 |
| `sendTo(name, channel, ...args)` | 向指定窗口 `webContents.send` |
| `broadcast(channel, ...args)` | 向所有存活窗口广播 |

### `getWindow` — 取窗并操作原生 API

```ts
const main = wm.getWindow('main')
if (main && !main.isDestroyed()) {
  main.setTitle('Electrum Admin')
  main.focus()
}

// 省略 name 时默认 'main'
wm.getWindow()?.minimize()
```

适合插件、`onAppReady`、或不方便用 `@WindowRef` 注入的代码路径。Controller / Service 内更常见的写法仍是：

```ts
import { WindowRef } from '@electrum/common'
import type { BrowserWindow } from 'electron'

@WindowRef('main')
mainWin!: BrowserWindow
```

### `sendTo` — 推给指定窗口

通道名任意（不必与 `@IpcHandle` 前缀相同）；渲染进程用 preload 暴露的 `on` / `ipcRenderer.on` 监听。

```ts
// 主进程：只通知 main 窗
wm.sendTo('main', 'app:status', { online: true })

// 例如设置窗改完主题后，通知设置窗自己刷新
wm.sendTo('settings', 'theme:changed', { theme: 'light' })
```

渲染侧（`@electrum/client`）：

```ts
import { createClient } from '@electrum/client'

const api = createClient()
api.on('app:status', (payload) => {
  console.log(payload.online)
})
```

Controller 内一对一推送更推荐 `@IpcEmit`（通道带 Controller `prefix`，且走 DI），见 [Controllers](./controllers)。`sendTo` 适合跨模块、插件、或没有 Controller 上下文时手动推。

### `broadcast` — 通知所有存活窗口

多窗口时同一事件需要人人收到：

```ts
// 主进程：所有未销毁窗口都会收到
wm.broadcast('session:expired', { reason: 'logout' })
wm.broadcast('config:reload')
```

```ts
// 渲染侧（每个窗口各自监听）
api.on('session:expired', () => {
  // 清本地状态 / 跳登录页
})
```

等价于对管理器里每个窗口调用 `sendTo`。`@IpcEmit(..., { window: 'broadcast' })` 底层也是这条路径。
## 应用事件 `@AppEvent`

把 Electron `app` 事件绑到 Controller / Provider 方法：

```ts
import { AppEvent } from '@electrum/common'

@AppEvent('window-all-closed')
onAllClosed() {
  // ...
}
```

扫描阶段会对 controllers + providers 上的 `@AppEvent` 注册 `app.on(...)`。

## 生命周期钩子

实现可选接口并挂在会进入 DI 的类上：

| 钩子 | 时机 |
|------|------|
| `onModuleInit` | 模块相关实例就绪后 |
| `onAppReady` | 应用就绪时 |
| `onModuleDestroy` | 销毁 / 退出清理 |

具体触发顺序：`onModuleInit` → `onAppReady`；退出时走 `onModuleDestroy`（与 `before-quit` 清理相衔接）。

## 下一步

→ [示例项目](./examples)
