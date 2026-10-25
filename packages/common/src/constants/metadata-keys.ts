/**
 * Stage 3 装饰器写入 `Symbol.metadata` 时使用的键。
 * 一律用 `Symbol.for`，保证跨包读到同一 identity。
 */
export const META = {
  /** @Module — ModuleMetadata */
  MODULE: Symbol.for('electrum:module'),
  /** @Injectable — { isInjectable, scope } */
  INJECTABLE: Symbol.for('electrum:injectable'),
  /** @Controller — { prefix, window? } */
  CONTROLLER: Symbol.for('electrum:controller'),
  /** @WindowDeclaration — 窗口配置 */
  WINDOW_DECLARATION: Symbol.for('electrum:window_declaration'),

  /** @IpcHandle 方法列表（ipcMain.handle） */
  IPC_HANDLE: Symbol.for('electrum:ipc_handle'),
  /** @IpcOn 方法列表（ipcMain.on） */
  IPC_ON: Symbol.for('electrum:ipc_on'),
  /** @AppEvent 方法列表（app.on） */
  APP_EVENT: Symbol.for('electrum:app_event'),

  /** @Inject / @Optional / @WindowRef 属性注入点列表 */
  INJECTIONS: Symbol.for('electrum:injections'),

  /** 类级 @UseGuards / @UsePipes / @UseInterceptors / @UseFilters */
  CLASS_GUARDS: Symbol.for('electrum:class_guards'),
  CLASS_PIPES: Symbol.for('electrum:class_pipes'),
  CLASS_INTERCEPTORS: Symbol.for('electrum:class_interceptors'),
  CLASS_FILTERS: Symbol.for('electrum:class_filters'),

  /** 方法级中间件（按 method 名归档） */
  METHOD_GUARDS: Symbol.for('electrum:method_guards'),
  METHOD_PIPES: Symbol.for('electrum:method_pipes'),
  METHOD_INTERCEPTORS: Symbol.for('electrum:method_interceptors'),
  METHOD_FILTERS: Symbol.for('electrum:method_filters'),

  /** @Catch — 该 Filter 负责的异常类型列表 */
  CATCH: Symbol.for('electrum:catch'),
} as const

/** 类 → metadata 对象的缓存：注入路径每次 resolve 都会读，避免反复触达 Symbol.metadata */
const metadataCache = new WeakMap<Function, Record<PropertyKey, unknown>>()

export function getClassMetadata(target: Function): Record<PropertyKey, unknown> {
  let metadata = metadataCache.get(target)
  if (!metadata) {
    metadata = ((target as any)[Symbol.metadata] as Record<PropertyKey, unknown>) || {}
    metadataCache.set(target, metadata)
  }
  return metadata
}

export function readMetadata<T>(target: Function, key: PropertyKey): T | undefined {
  return getClassMetadata(target)[key] as T | undefined
}

/**
 * 取一份**可安全修改**的元数据数组副本。
 *
 * `Symbol.metadata` 在类继承时会把子类的 metadata 对象的原型指向父类的，
 * 于是 `metadata[KEY]` 可能读到**父类那个数组本身**。直接 `push` 会污染父类
 * （例如给 Base 塞进 Child 才有的 `@Inject` 字段），因此这里一律写时复制。
 */
export function ownMetadataArray<T>(
  metadata: Record<PropertyKey, unknown> | undefined,
  key: PropertyKey,
): T[] {
  const existing = metadata?.[key] as T[] | undefined
  return existing ? [...existing] : []
}
