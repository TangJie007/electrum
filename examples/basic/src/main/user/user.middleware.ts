import {
  Injectable,
  type CanActivate,
  type IpcContext,
  type PipeTransform,
} from '@electrum/common'

/** Demo Guard: always allow (shows @UseGuards wiring). */
@Injectable()
export class AllowAllGuard implements CanActivate {
  canActivate(_context: IpcContext): boolean {
    return true
  }
}

/** Demo Pipe: trim string fields on the first business argument. */
@Injectable()
export class TrimStringsPipe implements PipeTransform {
  transform(value: unknown, _context: IpcContext): unknown {
    if (!value || typeof value !== 'object') return value
    const next: Record<string, unknown> = { ...(value as Record<string, unknown>) }
    for (const [key, v] of Object.entries(next)) {
      if (typeof v === 'string') next[key] = v.trim()
    }
    return next
  }
}
