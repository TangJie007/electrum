import { ownMetadataArray } from '../constants/metadata-keys'

/**
 * 往元数据数组里追加一条并**写回** `metadata`。
 *
 * `ownMetadataArray` 只负责取「可安全修改的副本」，最后那句写回
 * 原本散落在六个装饰器里各写一遍 —— 漏掉它元数据就被静默丢弃，
 * 且这种 bug 只在继承场景下才暴露。这里收口成一处。
 *
 * 仅供 `decorators/` 内部使用，不从包入口导出（调用方全在本目录）。
 */
export function appendMetadata<T>(
  metadata: Record<PropertyKey, unknown>,
  key: PropertyKey,
  entry: T,
): void {
  const list = ownMetadataArray<T>(metadata, key)
  list.push(entry)
  metadata[key] = list
}
