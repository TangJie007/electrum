// Must run before any decorator evaluation.
// 这个文件只有副作用：真正起作用的是 `index.ts` 首行的 `import './polyfill'`，
// 不需要（也不应该）导出任何东西 —— 导出常量会让人误以为需要手动检查它。
;(Symbol as { metadata?: symbol }).metadata ??= Symbol.for('Symbol.metadata')
