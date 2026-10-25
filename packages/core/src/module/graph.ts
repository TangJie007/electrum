import type { DIContainer } from '../di/container'
import { formatToken } from '../di/container'
import type { ModuleRegistry } from '../di/module-registry'

/** 模块图里的一个 Provider */
export interface ModuleGraphProvider {
  token: string
  scope: string
}

/** 模块图里的一个模块 */
export interface ModuleGraphNode {
  name: string
  global: boolean
  imports: string[]
  /** 本模块注册的 Provider（不含子模块的） */
  providers: ModuleGraphProvider[]
  /** `exports` 原样内容：Provider token 或转发出去的模块名 */
  exports: string[]
}

/** 模块之间的边 */
export interface ModuleGraphEdge {
  from: string
  to: string
  kind: 'import' | 'export-module'
}

export interface ModuleGraph {
  modules: ModuleGraphNode[]
  edges: ModuleGraphEdge[]
}

/**
 * 构建模块图。
 *
 * 只读容器与注册表，不触发任何实例化 —— 可以在 `start()` 之前调用，
 * 用于「启动前先看一眼依赖结构」或生成文档配图。
 *
 * @param modules 扫描结果（`application.getScannedModules()`）
 */
export function buildModuleGraph(
  modules: Array<{ moduleClass: Function }>,
  registry: ModuleRegistry,
  container: DIContainer,
): ModuleGraph {
  const nodes: ModuleGraphNode[] = []
  const edges: ModuleGraphEdge[] = []

  for (const { moduleClass } of modules) {
    const name = moduleClass.name
    const importedNames = registry.importsOf(moduleClass).map((mod) => mod.name)
    const exported = registry.exportsOf(moduleClass)

    nodes.push({
      name,
      global: registry.isGlobal(moduleClass),
      imports: importedNames,
      providers: container
        .getModuleProviders(moduleClass)
        .map((provider) => ({ token: formatToken(provider.token), scope: provider.scope })),
      exports: exported.map((entry) =>
        typeof entry === 'function' && registry.listModules().includes(entry)
          ? entry.name
          : formatToken(entry),
      ),
    })

    for (const imported of importedNames) {
      edges.push({ from: name, to: imported, kind: 'import' })
    }

    for (const entry of exported) {
      if (typeof entry === 'function' && registry.listModules().includes(entry)) {
        edges.push({ from: name, to: entry.name, kind: 'export-module' })
      }
    }
  }

  return { modules: nodes, edges }
}

/**
 * 生成 mermaid `flowchart` 源码，可直接贴进 Markdown 文档。
 *
 * - 实线箭头 = `imports`
 * - 虚线箭头 = `exports: [OtherModule]`（模块转发）
 * - 全局模块加 `:::` 高亮样式
 */
export function toMermaid(graph: ModuleGraph): string {
  const nodes = new Map(graph.modules.map((mod) => [mod.name, mod]))
  const id = (name: string) => `m_${name.replace(/[^A-Za-z0-9_]/g, '_')}`

  const lines: string[] = ['flowchart TD']

  for (const mod of graph.modules) {
    const label = mod.global ? `${mod.name}\\n(@Global)` : mod.name
    lines.push(`  ${id(mod.name)}["${label}"]`)
    if (mod.global) lines.push(`  class ${id(mod.name)} globalModule`)
  }

  for (const edge of graph.edges) {
    if (!nodes.has(edge.to)) continue
    const arrow = edge.kind === 'import' ? '-->' : '-.->'
    lines.push(`  ${id(edge.from)} ${arrow} ${id(edge.to)}`)
  }

  lines.push('  classDef globalModule fill:#fee2e2,stroke:#b91c1c;')
  return lines.join('\n')
}
