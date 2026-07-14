# Spec: 中间件装饰器与全局注册

> **模块**: 中间件链  
> **状态**: 🔵 草稿（draft）  
> **优先级**: medium  
> **版本**: 1.0.0  
> **更新时间**: 2026-07-14

---

## 功能描述

@UseGuards/@UsePipes/@UseInterceptors/@UseFilters 支持 class/method；Application 提供 useGlobal* API

---

## 验收标准

- [ ] 类级与方法级均可挂载且执行顺序为 global→class→method
- [ ] app.useGlobalGuards/Pipes/Interceptors/Filters 对所有通道生效
- [ ] @IpcOn 仅执行 Guard 后调方法

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
