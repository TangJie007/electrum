# Spec: 元数据 Key 与读取工具

> **模块**: TS5 装饰器元数据机制  
> **状态**: 🔵 草稿（draft）  
> **优先级**: high  
> **版本**: 1.0.0  
> **更新时间**: 2026-07-14

---

## 功能描述

通过 Symbol.for 定义 META 键（MODULE/INJECTABLE/CONTROLLER/IPC/注入点/中间件等），并提供 getClassMetadata、readMetadata

---

## 验收标准

- [ ] META 常量覆盖文档列出的类/方法/属性/中间件 key
- [ ] 读写均经由 Class[Symbol.metadata]，不依赖 reflect-metadata
- [ ] 跨包 / 重复加载模块时 Symbol.for key 仍一致可读取

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
