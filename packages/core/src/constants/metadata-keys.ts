export const META = {
  MODULE: Symbol.for('emvc:module'),
  INJECTABLE: Symbol.for('emvc:injectable'),
  CONTROLLER: Symbol.for('emvc:controller'),
  WINDOW_DECLARATION: Symbol.for('emvc:window_declaration'),

  IPC_HANDLE: Symbol.for('emvc:ipc_handle'),
  IPC_ON: Symbol.for('emvc:ipc_on'),
  APP_EVENT: Symbol.for('emvc:app_event'),

  INJECTIONS: Symbol.for('emvc:injections'),

  CLASS_GUARDS: Symbol.for('emvc:class_guards'),
  CLASS_PIPES: Symbol.for('emvc:class_pipes'),
  CLASS_INTERCEPTORS: Symbol.for('emvc:class_interceptors'),
  CLASS_FILTERS: Symbol.for('emvc:class_filters'),

  METHOD_GUARDS: Symbol.for('emvc:method_guards'),
  METHOD_PIPES: Symbol.for('emvc:method_pipes'),
  METHOD_INTERCEPTORS: Symbol.for('emvc:method_interceptors'),
  METHOD_FILTERS: Symbol.for('emvc:method_filters'),
} as const

export function getClassMetadata(target: Function): Record<PropertyKey, unknown> {
  return ((target as any)[Symbol.metadata] as Record<PropertyKey, unknown>) || {}
}

export function readMetadata<T>(target: Function, key: PropertyKey): T | undefined {
  return getClassMetadata(target)[key] as T | undefined
}
