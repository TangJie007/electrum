/**
 * 对应：packages/common/src/constants/metadata-keys.ts
 *
 * 装饰器「声明依赖」与容器「读取依赖」之间，靠这些 Symbol 当钥匙。
 * 用 Symbol.for 保证跨模块同一把钥匙。
 */
export const META = {
  INJECTABLE: Symbol.for('demo:injectable'),
  INJECTIONS: Symbol.for('demo:injections'),
} as const

/** 从类上读 Symbol.metadata（装饰器写入的副作用） */
export function getClassMetadata(target: Function): Record<PropertyKey, unknown> {
  return ((target as any)[Symbol.metadata] as Record<PropertyKey, unknown>) || {}
}

export function readMetadata<T>(target: Function, key: PropertyKey): T | undefined {
  return getClassMetadata(target)[key] as T | undefined
}
