# Spec: Guard Pipe Interceptor Filter 管道

> **模块**: 中间件链  
> **状态**: 🔵 草稿（draft）  
> **优先级**: medium  
> **版本**: 1.0.0  
> **更新时间**: 2026-07-14

---

## 功能描述

MiddlewarePipeline：Handle 路径 Guard→Pipe→洋葱 Interceptor→Controller，异常走 Filter；类级+方法级+全局合并

---

## 验收标准

- [ ] Guard false 抛 ForbiddenException
- [ ] Pipe 对 args[0] 依次 transform
- [ ] Interceptor 洋葱包装 next
- [ ] Filter 返回 IpcErrorResponse；无 Filter 时有默认 INTERNAL/UNKNOWN

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
