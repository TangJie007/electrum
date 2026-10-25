import { describe, it, expect } from 'vitest'
import {
  ElectronException,
  NotFoundException,
  ForbiddenException,
  ValidationException,
} from '../error/base.exception'

describe('ElectronException', () => {
  it('names itself after the concrete subclass', () => {
    expect(new NotFoundException('user').name).toBe('NotFoundException')
    expect(new ForbiddenException().name).toBe('ForbiddenException')
  })

  it('serializes to the IPC error shape', () => {
    const json = new NotFoundException('user').toJSON()

    expect(json.__error).toBe(true)
    expect(json.code).toBe('NOT_FOUND')
    expect(json.message).toBe('user not found')
    expect(json.details).toBeUndefined()
  })

  it('keeps ValidationException.errors in sync with details', () => {
    const errors = [{ field: 'email', reason: 'invalid' }]
    const exception = new ValidationException('bad input', errors)

    // errors 是 details 的视图，两者不应各存一份
    expect(exception.errors).toBe(errors)
    expect(exception.toJSON().details).toBe(errors)
  })

  it('defaults an empty errors list when details are missing', () => {
    const exception = new ElectronException('boom')
    expect(exception.details).toBeUndefined()
  })
})
