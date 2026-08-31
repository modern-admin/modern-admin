import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Response } from 'express'
import { type Observable, defer, firstValueFrom, from } from 'rxjs'
import {
  cacheKey,
  type CurrentAdmin,
  type ModernAdmin,
  ResourceNotFoundError,
  listTag,
  recordTag,
  recordsTag,
  rolePermissionsTag,
  resolveResourceCacheConfig,
} from '@modern-admin/core'
import { MODERN_ADMIN } from './tokens.js'
import { NO_HTTP_CACHE } from './no-http-cache.js'
import { wantsRevalidation } from './revalidate.js'

/** Header name follows the de-facto convention used by Varnish/Cloudflare. */
const CACHE_HEADER = 'x-cache'

/**
 * Permission-scope discriminator baked into the cache key. Two principals
 * share a cached response iff they share this scope (same api key, same user,
 * same fallback role, or both anonymous).
 */
const principalScope = (principal: CurrentAdmin | undefined): string => {
  const apiKey = principal?.apiKey as { id?: string } | undefined
  if (apiKey?.id) return `key:${apiKey.id}`
  if (principal?.id) return `user:${principal.id}`
  if (principal?.role) return `role:${principal.role}`
  return 'anon'
}

/** Canonicalise query parameter order without changing repeated-value order. */
export const canonicalHttpUrl = (originalUrl: string): string => {
  const parsed = new URL(originalUrl, 'http://modern-admin.local')
  parsed.searchParams.sort()
  const query = parsed.searchParams.toString()
  return `${parsed.pathname}${query ? `?${query}` : ''}`
}

/**
 * GET-only response cache.
 *
 * The cache key is derived from the resource id, the full original URL —
 * so the same controller handler can be cached for distinct query strings
 * without collisions — and the requesting principal's permission scope.
 * Authorization gates and per-property redaction run inside
 * `admin.invoke()`, i.e. *downstream* of this interceptor: on a HIT the
 * handler never runs, so the stored body must only ever be replayed to
 * principals with the same visibility. The scope dimension is:
 *
 *   * api-key principals → `key:<api-key id>` (per-key permission list)
 *   * session principals → `user:<id>` (safe for per-user visibility)
 *   * principals without an id but with a role → `role:<role>`
 *   * everything else → `anon`
 *
 * The per-user default avoids sharing already-redacted HTTP bodies between
 * users of the same role. A custom anonymous principal without a stable id
 * must disable `cache.http` when visibility varies between requests.
 *
 * Tags follow the same scheme used by the action-layer cache:
 *
 *   * record-scoped GETs (URL contains a `recordId`) →
 *     `record:<id>:<rid>` + resource-wide `records:<rid>`
 *   * everything else → `list:<id>`
 *
 * Mutation actions invalidate these tags, which lets HTTP responses drop
 * in lockstep with the action-layer entries.
 *
 * A request carrying `Cache-Control: no-cache` (the admin UI's refresh
 * button) skips the read and re-populates the entry from the handler's
 * fresh response — `x-cache: REVALIDATED`. Deciding whether the *data*
 * actually changed, and dropping the resource's other cached scopes when
 * it did, happens one layer down in `CacheRuntime` so every transport
 * gets the same behaviour; that invalidation runs inside the handler, i.e.
 * before the fresh response is stored here.
 *
 * TTL and on/off are driven by `ResourceOptions.cache.http` (or the
 * resource-level fallback). Non-GET requests pass through untouched.
 */
@Injectable()
export class ModernAdminCacheInterceptor implements NestInterceptor {
  constructor(
    @Inject(MODERN_ADMIN) private readonly admin: ModernAdmin,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp()
    const req = http.getRequest<{
      method: string
      originalUrl: string
      params: Record<string, string>
      headers?: unknown
      currentAdmin?: CurrentAdmin
    }>()
    const res = http.getResponse<Response>()
    const setHeader = (value: 'HIT' | 'MISS' | 'BYPASS' | 'REVALIDATED'): void => {
      if (typeof res?.setHeader === 'function') res.setHeader(CACHE_HEADER, value)
    }

    if (req.method !== 'GET') {
      setHeader('BYPASS')
      return next.handle()
    }
    // Handlers marked with `@NoHttpCache()` — notably the custom-action GET
    // routes, whose bodies come from user handlers we hold no tags for.
    const optedOut = this.reflector.getAllAndOverride<boolean>(NO_HTTP_CACHE, [
      context.getHandler(),
      context.getClass(),
    ])
    if (optedOut) {
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
    let cfg: { enabled: boolean; ttl: number; jitterRatio: number; crossReplicaLock: boolean }
    try {
      const resource = this.admin.findResource(resourceId)
      const decorator = resource.decorate()
      cfg = resolveResourceCacheConfig(decorator.options, 'http')
      const actionName = req.params.recordId ? 'show' : 'list'
      const hasDynamicAccess =
        typeof decorator.getAction(actionName)?.merged.isAccessible === 'function' ||
        decorator.properties.some((property) => typeof property.options.isAccessible === 'function')
      if (hasDynamicAccess) {
        setHeader('BYPASS')
        return next.handle()
      }
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
    const tags = recordId
      ? [recordTag(resourceId, recordId), recordsTag(resourceId)]
      : [listTag(resourceId)]
    if (this.admin.options.rolesResourceId) {
      tags.push(rolePermissionsTag())
      if (req.currentAdmin?.role) tags.push(rolePermissionsTag(String(req.currentAdmin.role)))
    }
    const key = cacheKey(
      'nest',
      req.method,
      canonicalHttpUrl(req.originalUrl),
      principalScope(req.currentAdmin),
    )

    return defer(() =>
      from(
        this.admin.cacheRuntime.read(
          key,
          {
            enabled: true,
            ttl: cfg.ttl,
            jitterRatio: cfg.jitterRatio,
            crossReplicaLock: cfg.crossReplicaLock,
            tags,
            refresh: wantsRevalidation(req.headers),
            onStatus: (status) =>
              setHeader(status.toUpperCase() as 'HIT' | 'MISS' | 'BYPASS' | 'REVALIDATED'),
          },
          () => firstValueFrom(next.handle()),
        ),
      ),
    )
  }
}
