# Electrum 文档源码

本目录是 **VitePress** 站点根目录。

## 本地预览

```bash
# 仓库根目录
pnpm docs:dev      # 开发服务器
pnpm docs:build    # 构建静态站
pnpm docs:preview  # 预览构建结果
```

## 目录

| 路径 | 说明 |
|------|------|
| `index.md` | 站点首页 |
| `guide/` | 使用指南（概述 → Controllers → Providers → 模块 → Preload / Client…） |
| `guide/preload.md` | `@electrum/preload` |
| `guide/client.md` | `@electrum/client` |
| `core/` | `@electrum/core` 实现学习（深入源码） |
| `.vitepress/` | VitePress 配置 |

设计总方案见仓库根目录 `electron-mvc-framework-design.md`。  
需求 Spec 目录：`specs/`。
