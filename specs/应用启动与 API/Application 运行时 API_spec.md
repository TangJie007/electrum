# Spec: Application 运行时 API

> **模块**: 应用启动与 API  
> **状态**: 🔵 草稿（draft）  
> **优先级**: high  
> **版本**: 1.0.0  
> **更新时间**: 2026-07-14

---

## 功能描述

提供 use/useGlobal*/generateTypes/reload/resolve/getWindowManager 等公共方法

---

## 验收标准

- [ ] app.resolve(token) 返回 DI 实例
- [ ] app.getWindowManager() 返回窗口管理器
- [ ] 全局中间件与插件挂载 API 存在且可链式调用

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
