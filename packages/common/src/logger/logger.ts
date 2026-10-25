export type LogLevel = 'debug' | 'log' | 'warn' | 'error' | 'verbose'

/**
 * 各级别的「最低可输出位置」：数值越小越啰嗦。
 *
 * `setLevel(x)` 表示「只输出重要度不低于 x 的日志」，因此 `verbose` 最宽松（全开）、
 * `error` 最严格（只留错误）。早期版本把 `debug` 排在 `verbose` 前面，
 * 导致 `setLevel('verbose')` 反而看不到 debug —— 与「verbose 全开」的语义相反。
 */
const LEVEL_ORDER: Record<LogLevel, number> = {
  verbose: 0,
  debug: 1,
  log: 2,
  warn: 3,
  error: 4,
}

export class Logger {
  private static globalLevel: LogLevel = 'log'

  constructor(private context: string) {}

  static setLevel(level: LogLevel): void {
    Logger.globalLevel = level
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog('debug')) console.debug(`[${this.context}] ${message}`, ...args)
  }

  verbose(message: string, ...args: any[]): void {
    if (this.shouldLog('verbose')) console.log(`[${this.context}] ${message}`, ...args)
  }

  log(message: string, ...args: any[]): void {
    if (this.shouldLog('log')) console.log(`[${this.context}] ${message}`, ...args)
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog('warn')) console.warn(`[${this.context}] ${message}`, ...args)
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog('error')) console.error(`[${this.context}] ${message}`, ...args)
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[Logger.globalLevel]
  }
}
