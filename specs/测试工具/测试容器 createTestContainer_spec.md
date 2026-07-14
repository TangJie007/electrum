# Spec: 测试容器 createTestContainer

> **模块**: 测试工具  
> **状态**: 🔵 草稿（draft）  
> **优先级**: low  
> **版本**: 1.0.0  
> **更新时间**: 2026-07-14

---

## 功能描述

@electrum/testing 提供 TestContainer：register/mock/resolve，脱离 Electron 测 Service

---

## 验收标准

- [ ] mock(token,value) 后 resolve 拿到 mock
- [ ] 可纯单测带 @Inject 的 Service
- [ ] 包可通过 vitest 运行文档示例级用例

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
