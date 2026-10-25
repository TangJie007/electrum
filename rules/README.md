---
description: Electrum 项目规则总索引 —— A-E 重要性等级定义、规则清单、跨编辑器（Cursor / CodeBuddy 等）接入与自动更新约定
globs: **/*
alwaysApply: true
---

# Electrum 项目规则索引

`rules/` 是本仓库**规则约束的唯一真源（single source of truth）**。所有内容均为纯 Markdown + YAML frontmatter，与编辑器无关。

其它编辑器的规则目录（`.cursor/rules/`、`.codebuddy/rules/`）都是**由脚本从本目录生成的镜像**，请勿直接编辑镜像文件。

## 规则清单

| 规则文件 | 约束范围 | 状态 |
|---|---|---|
| [`electrum-packages.md`](./electrum-packages.md) | `packages/**` 六个包的职责、文件层级、单文件职责与 A–E 重要性分级 | 生效中 |

## 重要性等级定义（A–E）

全仓库统一使用同一套刻度，避免不同规则之间口径不一致：

| 等级 | 含义 | 判定依据 |
|---|---|---|
| **A** | 核心（不可随意删改） | 包的唯一公共入口、核心抽象、跨包契约；或构建/执行链的必经节点。改动会影响所有下游，删除即断链 |
| **B** | 重要 | 承载主要运行时/生成逻辑，被 ≥2 个文件复用，或定义了关键行为语义 |
| **C** | 一般 | 支撑性模块或工具，职责单一、可替换，改动影响面有限 |
| **D** | 类型 | 纯类型 / 接口 / 常量声明，编译期生效、无运行时逻辑、下游引用少 |
| **E** | 附属 | 构建配置、`*.spec.ts` 测试、`__mocks__/`、测试夹具、`dist/` 产物。不参与对外发布契约，可自由重构 |

## 文件命名与格式约定

每个规则文件顶部必须有 YAML frontmatter：

```yaml
---
description: 一句话说明这条规则约束什么        # 必填，供工具判断是否命中
globs: packages/**/*.ts,packages/**/*.json     # 逗号分隔的 glob；**/* 表示全仓
alwaysApply: false                             # true = 无条件加载（仅用于本 README）
---
```

- 文件名用小写连字符（kebab-case），语义清晰，如 `electrum-packages.md`、`docs-style.md`。
- 正文用「文件树 + 行尾等级字母」描述结构，职责一句话写完，不留 TODO。

## 同步到各编辑器

```bash
pnpm rules:sync        # 把 rules/*.md 镜像到 .cursor/rules/*.mdc 与 .codebuddy/rules/*.md
```

同步目标在 `scripts/sync-rules.mjs` 的 `TARGETS` 数组中维护。新增一个编辑器只需往数组里加一项：

```js
const TARGETS = [
  { dir: '.cursor/rules',   ext: '.mdc' },
  { dir: '.codebuddy/rules', ext: '.md'  },
  // { dir: '.windsurf/rules', ext: '.md' },   // 例：Windsurf
]
```

对于 Windsurf（`.windsurfrules`）、GitHub Copilot（`.github/copilot-instructions.md`）、Claude Code（`CLAUDE.md`）这类**单文件**工具，推荐在文件里放索引指针而非复制全文：

```md
# Electrum 项目规则

修改代码前请先阅读 `rules/` 目录下的规则文件，尤其是：
- rules/electrum-packages.md —— packages/ 结构约束与 A-E 重要性分级
```

## 自动更新约定

任何一次改动只要触及下列情形，**必须同步更新对应规则文件**，否则规则会与代码脱节：

1. 在 `packages/*/src` 下**新增 / 删除 / 移动**文件 → 更新 `electrum-packages.md` 中对应包的文件树与职责行。
2. 修改某包的 `src/index.ts` 导出面 → 更新该包「入口导出」段落。
3. 修改 `package.json` 的 `dependencies` / `peerDependencies` / `bin` / `exports` → 更新该包的依赖描述与依赖方向图。
4. 某个文件的重要性发生实质变化（例如从内部工具升级为被跨包引用）→ 调整其等级字母。
5. 新增其它约束（如 `examples/**`、`docs/**`、`specs/**`）→ 在 `rules/` 新建规则文件，并在上方「规则清单」表格追加一行。

改完 `rules/` 后运行 `pnpm rules:sync`，让镜像生效。
