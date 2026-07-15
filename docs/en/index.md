---
layout: home

hero:
  name: Electrum
  text: Electron Main-Process MVC Framework
  tagline: TypeScript 5 Stage 3 native decorators · Zero runtime dependencies · NestJS mental model
  actions:
    - theme: brand
      text: Getting Started
      link: /en/guide/getting-started
    - theme: alt
      text: Controllers
      link: /en/guide/controllers
    - theme: alt
      text: Examples
      link: /en/guide/examples

features:
  - title: TS5 Native Decorators
    details: Uses Stage 3 decorators and Symbol.metadata—no experimentalDecorators or reflect-metadata.
  - title: Modular + DI
    details: '@Module / @Injectable / @Inject, property injection, clear Provider and import boundaries.'
  - title: Type-Safe IPC
    details: '@Controller + @IpcHandle maps ipcMain; @electrum/preload / @electrum/client bridge renderer-side calls.'
  - title: Middleware Pipeline
    details: Guard → Pipe → Interceptor → Filter—aligned with the NestJS request pipeline, adapted for Electron IPC.
  - title: Declarative Windows
    details: '@WindowDeclaration describes BrowserWindow; @WindowRef injects window instances.'
  - title: Lightweight & Testable
    details: common / core / preload / client packages; business Services can be unit-tested without Electron.
---
