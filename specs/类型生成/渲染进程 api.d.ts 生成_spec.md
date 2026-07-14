# Spec: 渲染进程 api.d.ts 生成

> **模块**: 类型生成  
> **状态**: 🔵 草稿（draft）  
> **优先级**: medium  
> **版本**: 1.0.0  
> **更新时间**: 2026-07-14

---

## 功能描述

TypeGenerator 扫描 @IpcHandle 元数据生成 IpcApi/ElectronAPI 与 Window.api 声明；app.generateTypes(path) 可调用

---

## 验收标准

- [ ] 输出文件声明各 channel 的 invoke 签名骨架
- [ ] declare global Window.api: ElectronAPI
- [ ] 开发启动路径可调用 generateTypes

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
