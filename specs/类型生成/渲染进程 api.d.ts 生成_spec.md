# Spec: 渲染进程 api.d.ts 生成

> **模块**: 类型生成  
> **状态**: 🔵 草稿（draft）  
> **优先级**: medium  
> **版本**: 1.0.0  
> **更新时间**: 2026-07-14

---

## 功能描述

@electrum/codegen（electrum-codegen / generateIpcTypes）扫描 @Controller/@IpcHandle 生成带类型的 IpcApi；可选 Window.api 全局声明

---

## 验收标准

- [ ] 输出文件声明各 channel 的 invoke 精确签名
- [ ] 可选 declare global Window.api: ElectronAPI（--global）
- [ ] 开发路径可通过 electrum-codegen CLI 或 generateIpcTypes API 调用

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
