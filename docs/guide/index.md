# 指南总览

Electrum 把 NestJS 风格的 **装饰器 + DI + 模块化 + MVC** 带到 Electron 主进程，帮助你组织 IPC、窗口与业务逻辑。

## 你会学到什么

| 章节 | 内容 |
|------|------|
| [快速开始](./getting-started) | 安装、构建、跑示例、最小可运行代码 |
| [核心概念](./concepts) | `@electrum/common` vs `@electrum/core`、装饰器心智模型 |
| [模块系统](./modules) | `@Module`、imports / providers / controllers / declarations |
| [依赖注入](./dependency-injection) | `@Injectable`、`@Inject`、属性注入 |
| [IPC 通信](./ipc) | `@Controller`、`@IpcHandle` / `@IpcOn`、通道命名 |
| [中间件](./middleware) | Guard / Pipe / Interceptor / Filter |
| [窗口与生命周期](./windows-lifecycle) | 声明式窗口、`@AppEvent`、钩子 |
| [示例项目](./examples) | `examples/basic` 与 `examples/di` |

## 适合谁

- 想用清晰模块边界组织 Electron 主进程代码
- 熟悉或愿意采用 NestJS 式写法的桌面应用开发者
- 需要可测试、可渐进引入框架层的项目

## 下一步

→ [快速开始](./getting-started)
