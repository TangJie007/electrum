import type { Token } from './container'

/**
 * 模块可见性注册表：记录每个 @Module 的 imports / exports，回答
 * 「consumer 模块能不能看见 owner 模块注册的 token」。
 *
 * 规则（与 Nest 一致，但向后兼容 Electrum 旧行为）：
 * - 模块自己的 Provider，自己一定可见
 * - consumer 通过 imports 链到达 owner，且 owner 导出了该 token → 可见
 * - owner **声明了** exports 但不含该 token → 不可见
 * - owner **没有声明** exports → 视为全导出（旧行为，保证存量代码不 break）
 */
export class ModuleRegistry {
  private imports = new Map<Function, Set<Function>>()
  private exports = new Map<Function, Set<Token>>()

  /**
   * 登记一个模块的导入 / 导出关系。
   * @param moduleClass 模块类
   * @param metadata 模块元数据中的 imports / exports
   */
  register(
    moduleClass: Function,
    metadata: { imports?: Function[]; exports?: Token[] } = {},
  ): void {
    this.imports.set(moduleClass, new Set(metadata.imports || []))

    // 只有显式声明 exports 的模块才纳入白名单校验；未声明 = 全导出
    if (metadata.exports) {
      this.exports.set(moduleClass, new Set(metadata.exports))
    }
  }

  /** 该模块是否「全导出」（未声明 exports 白名单） */
  exportsAll(moduleClass: Function): boolean {
    return !this.exports.has(moduleClass)
  }

  /**
   * consumer 模块能否看见 owner 模块下的 token。
   *
   * 沿 imports 做 BFS；穿透中间模块时要求该中间模块是全导出的
   * （否则它只转发自己 exports 的内容）。
   */
  canSee(consumer: Function, owner: Function, token: Token): boolean {
    if (consumer === owner) return true

    const queue: Function[] = [consumer]
    const visited = new Set<Function>([consumer])

    while (queue.length > 0) {
      const current = queue.shift()!

      for (const imported of this.imports.get(current) || []) {
        if (visited.has(imported)) continue
        visited.add(imported)

        if (imported === owner) {
          const exported = this.exports.get(owner)
          if (!exported || exported.has(token)) return true
          continue
        }

        // 中间模块只有全导出时才继续向下穿透
        if (this.exportsAll(imported)) queue.push(imported)
      }
    }

    return false
  }

  reset(): void {
    this.imports.clear()
    this.exports.clear()
  }
}
