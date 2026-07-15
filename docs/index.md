---
layout: home

hero:
  name: Electrum
  text: Electron 主进程 MVC 框架
  tagline: 基于 TypeScript 5 Stage 3 原生装饰器 · 零运行时依赖 · NestJS 心智模型
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/getting-started
    - theme: alt
      text: Controllers
      link: /guide/controllers
    - theme: alt
      text: 深入源码
      link: /core/

features:
  - title: TS5 原生装饰器
    details: 使用 Stage 3 装饰器与 Symbol.metadata，不依赖 experimentalDecorators / reflect-metadata。
  - title: 模块化 + DI
    details: '@Module / @Injectable / @Inject，属性注入，清晰的 Provider 与导入边界。'
  - title: 类型安全 IPC
    details: '@Controller + @IpcHandle 映射 ipcMain，通道前缀约定清晰，可生成渲染侧类型骨架。'
  - title: 中间件管道
    details: Guard → Pipe → Interceptor → Filter，对齐 NestJS 请求管线，适配 Electron IPC。
  - title: 声明式窗口
    details: '@WindowDeclaration 描述 BrowserWindow，@WindowRef 注入窗口实例。'
  - title: 轻量可测
    details: common 与 core 分包；业务 Service 可脱离 Electron 做单元测试。
---
