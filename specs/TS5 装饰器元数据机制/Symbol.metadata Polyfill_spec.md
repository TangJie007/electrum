# Spec: Symbol.metadata Polyfill

> **模块**: TS5 装饰器元数据机制  
> **状态**: 🔵 草稿（draft）  
> **优先级**: high  
> **版本**: 1.0.0  
> **更新时间**: 2026-07-14

---

## 功能描述

在 @electrum/common 入口确保 Symbol.metadata 存在，且必须在所有装饰器求值之前执行

---

## 验收标准

- [ ] common 提供 polyfill.ts 并用 Symbol.for('Symbol.metadata') 兜底
- [ ] 入口 re-export 使引用包时 polyfill 生效
- [ ] 无 Symbol.metadata 的运行时环境下装饰器写入后仍可读取 Class[Symbol.metadata]

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
