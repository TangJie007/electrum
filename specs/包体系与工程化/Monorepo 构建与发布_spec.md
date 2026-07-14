# Spec: Monorepo 构建与发布

> **模块**: 包体系与工程化  
> **状态**: 🔵 草稿（draft）  
> **优先级**: high  
> **版本**: 1.0.0  
> **更新时间**: 2026-07-14

---

## 功能描述

使用 pnpm workspace + turbo + tsup 构建，产出 CJS + .d.ts，满足 core <50KB、零运行时依赖目标

---

## 验收标准

- [ ] 根目录配置 pnpm-workspace.yaml 与 turbo.json
- [ ] 各包可通过 tsup 构建出 format cjs、dts:true
- [ ] 构建产物不引入 reflect-metadata 等运行时依赖
- [ ] 发布命名与 exports 对齐文档中的 package.json 示意

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
