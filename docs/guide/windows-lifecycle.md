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

| 能力 | 用途 |
|------|------|
| `getWindow(name)` | 取单个窗口（默认 `main`） |
| `sendTo(name, channel, ...args)` | 向指定窗口 `webContents.send` |
| `broadcast(channel, ...args)` | 向所有存活窗口广播 |

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

具体触发顺序以实现为准，见 [窗口 / 事件 / 生命周期](/core/window-event-lifecycle)。

## 下一步

→ [示例项目](./examples)
