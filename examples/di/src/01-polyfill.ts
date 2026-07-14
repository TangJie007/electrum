/**
 * 对应：packages/common/src/polyfill.ts
 *
 * Stage 3 装饰器把元数据写在 `context.metadata`（底层挂到 `Symbol.metadata`）。
 * 旧环境没有这个 well-known symbol 时，先 polyfill，否则装饰器求值会失败。
 */
;(Symbol as { metadata?: symbol }).metadata ??= Symbol.for('Symbol.metadata')

export const METADATA_READY = true
