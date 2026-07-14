# Spec: 属性注入解析

> **模块**: 依赖注入容器  
> **状态**: 🔵 草稿（draft）  
> **优先级**: high  
> **版本**: 1.0.0  
> **更新时间**: 2026-07-14

---

## 功能描述

DIContainer 无参 new 后读取 INJECTIONS，按 service/window/optional 递归 resolve 并赋值

---

## 验收标准

- [ ] 支持 useValue/useClass/useFactory(+inject) 注册
- [ ] window token 经 setWindowProvider 解析，缺失则抛错
- [ ] optional 注入缺失时不抛错且字段保持 undefined

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
