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
 * 规则与 Nest 对齐：
 * - 模块自己的 Provider，自己一定可见
 * - `@Global()` 模块的 Provider 全局可见
 * - consumer 通过 imports 链到达 owner，且 owner 的 `exports` 含该 token → 可见
 * - `exports` 里写模块类 = 转发该模块的全部导出（可跨层）
 * - **不声明 `exports` = 什么都不导出**（默认私有）
 */
export class ModuleRegistry {
  private imports = new Map<Function, Set<Function>>()
  private exports = new Map<Function, Set<Token>>()
  private globals = new Set<Function>()

  /**
   * 登记一个模块的导入 / 导出关系。
   * @param moduleClass 模块类
   * @param metadata 模块元数据中的 imports / exports / global
   */
  register(moduleClass: Function, metadata: ModuleRelations = {}): void {
    this.imports.set(moduleClass, new Set(metadata.imports || []))
    // 始终登记（哪怕是空集合）：没登记 = 手工 register 的模块，交给调用方自行负责
    this.exports.set(moduleClass, new Set(metadata.exports || []))
    if (metadata.global) this.globals.add(moduleClass)
  }

  /** 该模块是否被 `@Global()` 标记 */
  isGlobal(moduleClass: Function): boolean {
    return this.globals.has(moduleClass)
  }

  /** 该模块是否未登记过 exports（未登记视为不做可见性限制，供手工 register 场景使用） */
  exportsAll(moduleClass: Function): boolean {
    return !this.exports.has(moduleClass)
  }

  /**
   * consumer 模块能否看见 owner 模块下的 token。
   *
   * 沿 imports 做 BFS；中间模块必须把 token（或 owner 模块本身）写进 exports
   * 才能继续向下传递，语义同 Nest 的逐层 re-export。
   */
  canSee(consumer: Function, owner: Function, token: Token): boolean {
    if (consumer === owner) return true
    if (this.isGlobal(owner)) return true

    const visited = new Set<Function>([consumer])
    const queue: Function[] = [consumer]

    while (queue.length > 0) {
      const current = queue.shift()!

      for (const imported of this.imports.get(current) || []) {
        if (visited.has(imported)) continue
        visited.add(imported)

        if (imported === owner) {
          if (this.exports.get(owner)?.has(token)) return true
          continue
        }

        const forwarded = this.exports.get(imported)
        // 未登记的模块不做穿透，避免意外放宽
        if (!forwarded) continue

        // token 级转发：该模块声明了这个 token 对它可见，继续沿链找 owner
        if (forwarded.has(token)) {
          queue.push(imported)
          continue
        }

        // 模块级转发：exports 里直接写了 owner
        if (forwarded.has(owner)) return true

        // 模块级转发：exports 里写了别的模块，继续从那个模块往下找
        for (const entry of forwarded) {
          if (typeof entry !== 'function' || entry === owner) continue
          if (this.exports.has(entry) && !visited.has(entry)) queue.push(entry)
        }
      }
    }

    return false
  }

  reset(): void {
    this.imports.clear()
    this.exports.clear()
    this.globals.clear()
  }
}
