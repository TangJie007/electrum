# Spec: EventBridge 绑定 AppEvent

> **模块**: 事件系统  
> **状态**: 🔵 草稿（draft）  
> **优先级**: medium  
> **版本**: 1.0.0  
> **更新时间**: 2026-07-14

---

## 功能描述

扫描 controllers+providers 的 @AppEvent 元数据，绑定到 electron app.on，异步错误捕获记日志

---

## 验收标准

- [ ] @AppEvent('window-all-closed') 等方法在 app 事件触发时执行
- [ ] Promise rejection 与同步 throw 均记 Logger.error
- [ ] 参数按 app.on 回调原样传递

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
