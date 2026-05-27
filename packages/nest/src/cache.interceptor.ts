import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common'
import type { Response } from 'express'
import { type Observable, from, of, switchMap, tap } from 'rxjs'
import {
  type ModernAdmin,
  ResourceNotFoundError,
  listTag,
  recordTag,
  resolveResourceCacheConfig,
} from '@modern-admin/core'
import { MODERN_ADMIN } from './tokens.js'

/** Header name follows the de-facto convention used by Varnish/Cloudflare. */
const CACHE_HEADER = 'x-cache'

/**
 * GET-only response cache.
 *
 * The cache key is derived from the resource id and the full original URL
 * so the same controller handler can be cached for distinct query strings
 * without collisions. Tags follow the same scheme used by the action-layer
 * cache:
 *
 *   * record-scoped GETs (URL contains a `recordId`) → `record:<id>:<rid>`
 *   * everything else → `list:<id>`
 *
 * Mutation actions invalidate one or both of these tags, which lets HTTP
 * responses drop in lockstep with the action-layer entries.
 *
 * TTL and on/off are driven by `ResourceOptions.cache.http` (or the
 * resource-level fallback). Non-GET requests pass through untouched.
 */
@Injectable()
export class ModernAdminCacheInterceptor implements NestInterceptor {
  constructor(@Inject(MODERN_ADMIN) private readonly admin: ModernAdmin) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp()
    const req = http.getRequest<{
      method: string
      originalUrl: string
      params: Record<string, string>
    }>()
    const res = http.getResponse<Response>()
    const setHeader = (value: 'HIT' | 'MISS' | 'BYPASS'): void => {
      if (typeof res?.setHeader === 'function') res.setHeader(CACHE_HEADER, value)
    }

    if (req.method !== 'GET') {
      setHeader('BYPASS')
      return next.handle()
    }
    const resourceId = req.params.resourceId
    if (!resourceId) {
      setHeader('BYPASS')
      return next.handle()
    }

    // Look up the decorator to apply per-resource cache config. An
    // unknown resource id just bypasses the cache rather than throwing
    // — the underlying controller will handle the 404 path itself.
    let cfg: { enabled: boolean; ttl: number }
    try {
      const resource = this.admin.findResource(resourceId)
      cfg = resolveResourceCacheConfig(resource.decorate().options, 'http')
    } catch (err) {
      if (err instanceof ResourceNotFoundError) {
        setHeader('BYPASS')
        return next.handle()
      }
      throw err
    }
    if (!cfg.enabled) {
      setHeader('BYPASS')
      return next.handle()
    }

    const recordId = req.params.recordId
    const tag = recordId ? recordTag(resourceId, recordId) : listTag(resourceId)
    const key = `nest:${req.method}:${req.originalUrl}`

    return from(this.admin.cache.get<unknown>(key)).pipe(
      switchMap((cached) => {
        if (cached !== undefined && cached !== null) {
          setHeader('HIT')
          return of(cached)
        }
        setHeader('MISS')
        return next.handle().pipe(
          tap((response) => {
            void this.admin.cache.set(key, response, { ttl: cfg.ttl, tags: [tag] })
          }),
        )
      }),
    )
  }
}
