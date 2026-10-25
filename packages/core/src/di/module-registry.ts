import type { Token } from './container'

/** 注册模块时提供的元数据子集 */
export interface ModuleRelations {
  imports?: Function[]
  exports?: Token[]
  global?: boolean
}

/**
 * 模块可见性注册表：记录每个 @Module 的 imports / exports，回答
 * 「consumer 模块能不能看见 owner 模块注册的 token」。
 *
 * 规则与 Nest 完全对齐：
 * - 模块自己的 Provider，自己一定可见
 * - **不声明 `exports` = 什么都不导出**（默认私有）
 * - `exports` 含该 token → 导入本模块的模块可见
 * - `exports` 含某个模块类 → 该模块的导出集合整体转出（可递归多层）
 * - `@Global()` 只免掉 imports，仍需把 token 写进 `exports`
 */
export class ModuleRegistry {
  private imports = new Map<Function, Set<Function>>()
  private exports = new Map<Function, Set<Token>>()
  private globals = new Set<Function>()
  /**
   * `canSee` 结果缓存：模块关系在扫描结束后不再变化，
   * 而每次属性注入都会问一遍「A 能不能看见 B 的 X」。
   */
  private canSeeCache = new Map<Function, Map<Function, Map<Token, boolean>>>()

  /**
   * 登记一个模块的导入 / 导出关系。
   * @param moduleClass 模块类
   * @param metadata 模块元数据中的 imports / exports / global
   */
  register(moduleClass: Function, metadata: ModuleRelations): void {
    this.imports.set(moduleClass, new Set(metadata.imports || []))
    // 始终登记（哪怕是空集合）：不写 exports 与空数组等价，都不对外暴露
    this.exports.set(moduleClass, new Set(metadata.exports || []))
    if (metadata.global) this.globals.add(moduleClass)
    // 关系变化后旧结论可能失效
    this.canSeeCache.clear()
  }

  /** 该模块是否被 `@Global()` 标记 */
  isGlobal(moduleClass: Function): boolean {
    return this.globals.has(moduleClass)
  }

  /** 已登记的模块类（按登记顺序） */
  listModules(): Function[] {
    return [...this.imports.keys()]
  }

  /** 该模块声明的 imports */
  importsOf(moduleClass: Function): Function[] {
    return [...(this.imports.get(moduleClass) || [])]
  }

  /** 该模块声明的 exports */
  exportsOf(moduleClass: Function): Token[] {
    return [...(this.exports.get(moduleClass) || [])]
  }

  /**
   * consumer 模块能否看见 owner 模块下的 token。
   *
   * 判定顺序：自己 → owner 是否真的导出了该 token → 全局模块 → consumer 的直接
   * imports 中有谁导出了它（转发的模块由 `isExported` 递归展开）。
   */
  canSee(consumer: Function, owner: Function, token: Token): boolean {
    if (consumer === owner) return true

    let byOwner = this.canSeeCache.get(consumer)
    if (!byOwner) {
      byOwner = new Map()
      this.canSeeCache.set(consumer, byOwner)
    }
    let byToken = byOwner.get(owner)
    if (!byToken) {
      byToken = new Map()
      byOwner.set(owner, byToken)
    }
    const cached = byToken.get(token)
    if (cached !== undefined) return cached

    const visible = this.computeCanSee(consumer, owner, token)
    byToken.set(token, visible)
    return visible
  }

  private computeCanSee(consumer: Function, owner: Function, token: Token): boolean {
    // 无论是全局模块还是普通模块，没写进 exports 就是私有
    if (!this.isExported(owner, token, new Set())) return false
    if (this.isGlobal(owner)) return true

    for (const imported of this.imports.get(consumer) || []) {
      if (imported === owner) return true
      if (this.isExported(imported, token, new Set())) return true
    }

    return false
  }

  /**
   * 该模块的 `exports` 是否覆盖 token。
   *
   * `exports: [OtherModule]` 表示把 OtherModule 的导出整体转出，因此需要递归；
   * `seen` 防止 A exports [B]、B exports [A] 时无限递归。
   */
  private isExported(moduleClass: Function, token: Token, seen: Set<Function>): boolean {
    if (seen.has(moduleClass)) return false
    seen.add(moduleClass)

    const exported = this.exports.get(moduleClass)
    if (!exported) return false
    if (exported.has(token)) return true

    for (const entry of exported) {
      if (typeof entry === 'function' && this.isExported(entry, token, seen)) return true
    }

    return false
  }

  reset(): void {
    this.imports.clear()
    this.exports.clear()
    this.globals.clear()
    this.canSeeCache.clear()
  }
}
