# Spec: @electrum 分包模型

> **模块**: 包体系与工程化  
> **状态**: 🔵 草稿（draft）  
> **优先级**: high  
> **版本**: 1.0.0  
> **更新时间**: 2026-07-14

---

## 功能描述

对齐 NestJS 拆分为 @electrum/common（装饰器/接口/异常）、@electrum/core（运行时）、@electrum/testing；common 零运行时依赖且禁止反向依赖 core

---

## 验收标准

- [ ] packages 下存在 common/core/testing 三个作用域包
- [ ] 用户装饰器从 @electrum/common 导入，createApp 从 @electrum/core 导入
- [ ] @electrum/common 的 dependencies 为空，peer 为 typescript>=5.2
- [ ] core 依赖 common；testing 依赖 core+common；common 不依赖 core/testing

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
