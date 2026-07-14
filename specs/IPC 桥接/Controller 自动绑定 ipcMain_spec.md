# Spec: Controller 自动绑定 ipcMain

> **模块**: IPC 桥接  
> **状态**: 🔵 草稿（draft）  
> **优先级**: high  
> **版本**: 1.0.0  
> **更新时间**: 2026-07-14

---

## 功能描述

IpcBridge 解析 Controller 实例，按 prefix 拼通道，绑定 @IpcHandle→handle、@IpcOn→on，并支持注销

---

## 验收标准

- [ ] @Controller('file')+@IpcHandle('read') 绑定 file:read
- [ ] devOnly 通道在非开发环境跳过
- [ ] 重复通道 warn 并 skip
- [ ] unregisterAll 移除全部 handler/listener

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
