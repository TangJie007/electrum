# Spec: ElectronException 与 IpcErrorResponse

> **模块**: 错误处理  
> **状态**: 🔵 草稿（draft）  
> **优先级**: high  
> **版本**: 1.0.0  
> **更新时间**: 2026-07-14

---

## 功能描述

统一错误基类与 NotFound/Forbidden/Validation；toJSON 产出 __error/code/message，开发态可带 stack

---

## 验收标准

- [ ] ElectronException.toJSON 含 __error:true
- [ ] ValidationException 将 errors 放入 details
- [ ] 生产环境默认不暴露 stack，开发环境可暴露

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
