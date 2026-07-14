# Spec: ModuleScanner 模块树扫描

> **模块**: 模块系统  
> **状态**: 🔵 草稿（draft）  
> **优先级**: high  
> **版本**: 1.0.0  
> **更新时间**: 2026-07-14

---

## 功能描述

从根 Module 递归 imports，读取 @Module 元数据，注册 providers 并收集 controllers/declarations

---

## 验收标准

- [ ] 未装饰 @Module 的根类抛错
- [ ] 函数 Provider 读取 @Injectable.scope 后 register
- [ ] Value/Class/Factory Provider 分别按约定注册
- [ ] visited Set 避免重复扫描

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
