import type { IpcErrorResponse } from './error-response'

export class ElectronException extends Error {
  constructor(
    message: string,
    public code: string = 'INTERNAL',
    public statusCode: number = 500,
    public details?: unknown,
  ) {
    super(message)
    this.name = this.constructor.name
  }

  toJSON(): IpcErrorResponse {
    return {
      __error: true,
      code: this.code,
      message: this.message,
      details: this.details,
      ...(process.env.NODE_ENV?.includes('dev') ? { stack: this.stack } : {}),
    }
  }
}

export class NotFoundException extends ElectronException {
  constructor(resource: string) {
    super(`${resource} not found`, 'NOT_FOUND', 404)
  }
}

export class ForbiddenException extends ElectronException {
  constructor(message = 'Access forbidden') {
    super(message, 'FORBIDDEN', 403)
  }
}

/**
 * 参数校验失败。
 *
 * `errors` 只以 `details` 的形式存一份（基类第四参），不再单独存字段 ——
 * 早期版本两者都存，`this.errors` 与 `this.details` 指向同一数据却要各维护一遍。
 * 需要明细时读 `details`，或直接用 `errors` 这个只读视图。
 */
export class ValidationException extends ElectronException {
  constructor(message: string, errors: unknown[]) {
    super(message, 'VALIDATION_ERROR', 422, errors)
  }

  /** `details` 的类型化视图（与 `details` 是同一份数据） */
  get errors(): unknown[] {
    return (this.details as unknown[]) ?? []
  }
}
