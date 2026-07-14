# Electrum

基于 TypeScript 5 Stage 3 原生装饰器的 Electron 主进程 MVC 框架（零运行时依赖）。

设计思路见 [`electron-mvc-framework-design.md`](./electron-mvc-framework-design.md)。

## 结构

```
packages/common   → @electrum/common（装饰器 / 接口 / 异常）
packages/core     → @electrum/core（运行时：DI / IPC / Application）
examples/basic    → @electrum/example-basic
```

## 快速开始

```bash
# 安装依赖
pnpm install

# 构建框架
pnpm build

# 跑单元测试
pnpm test

# 启动示例
pnpm dev:example
```

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
// 渲染进程: window.api.invoke('hello:greet')
```

## 当前能力（v0.1）

- TS5 原生装饰器 + `Symbol.metadata`
- `@Module` / `@Injectable` / `@Controller` / `@IpcHandle` / `@IpcOn` / `@AppEvent`
- 属性注入 `@Inject` / `@WindowRef` / `@Optional`
- DI 容器、模块扫描、IPC / Event 桥接
- 声明式窗口 `@WindowDeclaration`
- 中间件链（Guard / Pipe / Interceptor / Filter）
- 生命周期钩子、日志、异常类型
