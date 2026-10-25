import {
  Injectable,
  type CanActivate,
  type IpcContext,
  type PipeContext,
  type PipeTransform,
} from '@electrum/common'

/** Demo Guard: always allow (shows @UseGuards wiring). */
@Injectable()
export class AllowAllGuard implements CanActivate {
  canActivate(_context: IpcContext): boolean {
    return true
  }
}

/**
 * Demo Pipe: every `invoke` argument goes through this once
 * (`context.index` / `context.argCount` identify the position).
 * Object-shaped arguments get their string fields trimmed; scalars pass through.
 */
@Injectable()
export class TrimStringsPipe implements PipeTransform {
  transform(value: unknown, _context: PipeContext): unknown {
    if (!value || typeof value !== 'object') return value
    const next: Record<string, unknown> = { ...(value as Record<string, unknown>) }
    for (const [key, v] of Object.entries(next)) {
      if (typeof v === 'string') next[key] = v.trim()
    }
    return next
  }
}
