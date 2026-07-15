# Electrum docs (VitePress)

This directory is the **VitePress** site root.

## Local preview

```bash
# repo root
pnpm docs:dev      # dev server
pnpm docs:build    # static build
pnpm docs:preview  # preview build
```

## Languages (i18n)

| Locale | URL | Content |
|--------|-----|---------|
| 简体中文（默认） | `/` | Root: `index.md`, `guide/`, `core/` |
| English | `/en/` | Mirror: `en/index.md`, `en/guide/`, `en/core/` |

Config lives in `.vitepress/config/` (`shared` + `zh` + `en`). The nav language switcher is built into VitePress.

When adding or changing a page, update **both** locales (Chinese source + English under `en/`).

## Layout

| Path | Description |
|------|-------------|
| `index.md` / `en/index.md` | Home |
| `guide/` / `en/guide/` | User guide |
| `core/` / `en/core/` | `@electrum/core` deep dive |
| `.vitepress/` | VitePress config |

Design overview: repo root `electron-mvc-framework-design.md`.  
Specs: `specs/`.
