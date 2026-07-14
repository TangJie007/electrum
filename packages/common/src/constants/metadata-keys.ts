export const META = {
  MODULE: Symbol.for('electrum:module'),
  INJECTABLE: Symbol.for('electrum:injectable'),
  CONTROLLER: Symbol.for('electrum:controller'),
  WINDOW_DECLARATION: Symbol.for('electrum:window_declaration'),

  IPC_HANDLE: Symbol.for('electrum:ipc_handle'),
  IPC_ON: Symbol.for('electrum:ipc_on'),
  APP_EVENT: Symbol.for('electrum:app_event'),

  INJECTIONS: Symbol.for('electrum:injections'),

  CLASS_GUARDS: Symbol.for('electrum:class_guards'),
  CLASS_PIPES: Symbol.for('electrum:class_pipes'),
  CLASS_INTERCEPTORS: Symbol.for('electrum:class_interceptors'),
  CLASS_FILTERS: Symbol.for('electrum:class_filters'),

  METHOD_GUARDS: Symbol.for('electrum:method_guards'),
  METHOD_PIPES: Symbol.for('electrum:method_pipes'),
  METHOD_INTERCEPTORS: Symbol.for('electrum:method_interceptors'),
  METHOD_FILTERS: Symbol.for('electrum:method_filters'),
} as const

export function getClassMetadata(target: Function): Record<PropertyKey, unknown> {
  return ((target as any)[Symbol.metadata] as Record<PropertyKey, unknown>) || {}
}

export function readMetadata<T>(target: Function, key: PropertyKey): T | undefined {
  return getClassMetadata(target)[key] as T | undefined
}
