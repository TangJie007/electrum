# Spec: 三钩子接口与并行执行

> **模块**: 生命周期  
> **状态**: 🔵 草稿（draft）  
> **优先级**: high  
> **版本**: 1.0.0  
> **更新时间**: 2026-07-14

---

## 功能描述

OnModuleInit/OnAppReady/OnModuleDestroy；LifecycleManager 对已注册实例 Promise.allSettled 调用

---

## 验收标准

- [ ] 实现对应方法的 Controller/Provider 会被调用
- [ ] 单钩子失败不影响其他实例，且记录 error 日志
- [ ] 钩子可为 sync 或 async

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
