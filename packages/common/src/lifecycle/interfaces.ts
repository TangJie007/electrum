/**
 * 生命周期钩子契约。
 *
 * 这三个接口是 `LifecycleManager` 的**唯一**契约来源 —— 运行时那边
 * （`core/src/lifecycle/manager.ts` 的 `LifecycleHook`）必须从这里派生，
 * 不要另写一份字符串字面量联合，否则改了接口编译器也不会报错。
 */

/** 模块初始化：连接建立、缓存预热等 */
export interface OnModuleInit {
  onModuleInit(): void | Promise<void>
}

/** Electron `app.whenReady()` 之后、IPC 已就绪 */
export interface OnAppReady {
  onAppReady(): void | Promise<void>
}

/** 应用退出前：关闭连接、清理定时器 */
export interface OnModuleDestroy {
  onModuleDestroy(): void | Promise<void>
}

/**
 * 运行时按名字回调的钩子名。
 *
 * 从接口自身的键派生，而不是再抄一遍字符串 —— 改接口名时这里会自动跟着变。
 */
export type LifecycleHookName = keyof OnModuleInit | keyof OnAppReady | keyof OnModuleDestroy
