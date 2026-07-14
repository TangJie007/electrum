# Spec: 类装饰器 Module Injectable Controller

> **模块**: 装饰器系统  
> **状态**: 🔵 草稿（draft）  
> **优先级**: high  
> **版本**: 1.0.0  
> **更新时间**: 2026-07-14

---

## 功能描述

TS5 类装饰器将模块配置、可注入作用域、Controller 通道前缀写入 context.metadata

---

## 验收标准

- [ ] @Module 写入 imports/controllers/providers/exports/declarations
- [ ] @Injectable 支持 scope singleton|transient，默认 singleton
- [ ] @Controller(prefix) 写入前缀，可与无前缀空串组合

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
