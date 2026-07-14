# Spec: 声明式窗口创建与 DI 集成

> **模块**: 窗口管理  
> **状态**: 🔵 草稿（draft）  
> **优先级**: medium  
> **版本**: 1.0.0  
> **更新时间**: 2026-07-14

---

## 功能描述

@WindowDeclaration + WindowManager.initialize：按 declarations 创建窗口，默认 autoCreate，并向 DI 注册 windowProvider 供 @WindowRef

---

## 验收标准

- [ ] autoCreate!==false 时启动创建命名窗口
- [ ] dev 用 devUrl+DevTools，prod 用 prodFile
- [ ] closed 时从 Map 移除；getWindow/getAllWindows 可用
- [ ] @WindowRef 可注入对应 BrowserWindow

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
