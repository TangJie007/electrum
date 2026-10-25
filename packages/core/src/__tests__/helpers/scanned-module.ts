import type { ScannedModule } from '../../module/scanner'

/**
 * 构造最小可用的扫描结果。
 *
 * 桥接层 / 生命周期 / 模块图等组件的入参都是 `ScannedModule[]`，
 * 但单个用例通常只关心 controllers 或 providers 中的一项 ——
 * 这个函数原本在四个测试文件里各抄了一份。
 */
export function stubModule(overrides: Partial<ScannedModule> = {}): ScannedModule {
  return {
    moduleClass: class {},
    metadata: {},
    controllers: [],
    providers: [],
    declarations: [],
    ...overrides,
  }
}
