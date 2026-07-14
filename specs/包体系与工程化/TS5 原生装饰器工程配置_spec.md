# Spec: TS5 原生装饰器工程配置

> **模块**: 包体系与工程化  
> **状态**: 🔵 草稿（draft）  
> **优先级**: high  
> **版本**: 1.0.0  
> **更新时间**: 2026-07-14

---

## 功能描述

仓库与示例 tsconfig 启用 Stage 3 装饰器，禁用 experimentalDecorators/emitDecoratorMetadata

---

## 验收标准

- [ ] 未启用 experimentalDecorators 与 emitDecoratorMetadata
- [ ] lib 包含 ESNext.Decorators，useDefineForClassFields 为 true
- [ ] 示例/包可在 TypeScript>=5.2 下正常编译装饰器代码

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
