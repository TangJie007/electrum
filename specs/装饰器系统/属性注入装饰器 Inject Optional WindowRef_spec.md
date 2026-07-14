# Spec: 属性注入装饰器 Inject Optional WindowRef

> **模块**: 装饰器系统  
> **状态**: 🔵 草稿（draft）  
> **优先级**: high  
> **版本**: 1.0.0  
> **更新时间**: 2026-07-14

---

## 功能描述

Field decorator 声明注入点，替代构造函数/参数装饰器；支持 token、可选注入与窗口引用

---

## 验收标准

- [ ] @Inject(token) 写入 INJECTIONS 列表 type=service
- [ ] @Optional 与 @Inject 组合后该注入点 optional=true
- [ ] @WindowRef(name) 使用 electrum:window:name token 且 type=window

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
