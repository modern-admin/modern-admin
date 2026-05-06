import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import { Observable, from, of, switchMap, tap } from 'rxjs'
import { ModernAdmin } from '@modern-admin/core'
import { MODERN_ADMIN } from './tokens.js'

/**
 * GET-only response cache. Keys are derived from the resource id and
 * normalised query string; tags are `resource:<id>` so any mutation through
 * the action layer (which already invalidates) drops them. Non-GET requests
 * pass through untouched.
 */
@Injectable()
export class ModernAdminCacheInterceptor implements NestInterceptor {
  constructor(@Inject(MODERN_ADMIN) private readonly admin: ModernAdmin) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ method: string; originalUrl: string; params: Record<string, string> }>()
    if (req.method !== 'GET') return next.handle()
    const resourceId = req.params.resourceId
    if (!resourceId) return next.handle()
    const key = `nest:${req.method}:${req.originalUrl}`
    const tag = `resource:${resourceId}`
    return from(this.admin.cache.get<unknown>(key)).pipe(
      switchMap((cached) => {
        if (cached !== undefined && cached !== null) return of(cached)
        return next.handle().pipe(
          tap((response) => {
            void this.admin.cache.set(key, response, { ttl: 30, tags: [tag] })
          }),
        )
      }),
    )
  }
}
