# Spec: createApp 启动编排

> **模块**: 应用启动与 API  
> **状态**: 🔵 草稿（draft）  
> **优先级**: high  
> **版本**: 1.0.0  
> **更新时间**: 2026-07-14

---

## 功能描述

Application 串联 polyfill、DI、ModuleScanner、whenReady、IpcBridge、EventBridge、WindowManager、Lifecycle 钩子与 before-quit

---

## 验收标准

- [ ] createApp(AppModule).start() 可完成主进程就绪
- [ ] 启动步骤顺序符合文档第 0–9 步
- [ ] 未 ready 前不提前绑定业务 IPC 到不可用状态

---

## 依赖关系

（无）

---

## 标签

（无）

---

## 变更记录

| 日期 | 作者 | 摘要 | 变更内容 |
|------|------|------|----------|
| 2026-07-14 | AI | 初始版本，由 PRD 解析生成 | 全量生成 |

---

## 备注

（无）
