// HTTP cache interceptor — principal isolation contract.
//
// Authorization gates and per-property redaction run inside
// `admin.invoke()`, downstream of the interceptor. On a HIT the handler
// never executes, so a cached body must only ever be replayed to
// principals with the same permission scope: same api key, same user, or
// both anonymous. These tests pin the key scheme that guarantees it and
// the tags that keep HTTP entries in lockstep with action-layer
// invalidation.

import { describe, expect, test } from 'bun:test'
import { firstValueFrom, from, of } from 'rxjs'
import type { CallHandler, ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import {
  MemoryCacheProvider,
  ModernAdmin,
  type CurrentAdmin,
  type PropertyContext,
} from '@modern-admin/core'
import { canonicalHttpUrl, ModernAdminCacheInterceptor } from '../src/cache.interceptor.js'
import { NoHttpCache } from '../src/no-http-cache.js'
import { FakeDatabase, FakeResource, type FakeTable } from './_helpers/fake-adapter.js'

const adapter = { Database: FakeDatabase, Resource: FakeResource }

class InspectableCache extends MemoryCacheProvider {
  public readonly keys: string[] = []
  public readonly tagsByKey = new Map<string, string[]>()
  override async set<T = unknown>(
    key: string,
    value: T,
    options: { ttl?: number; tags?: string[] } = {},
  ): Promise<void> {
    this.keys.push(key)
    this.tagsByKey.set(key, options.tags ?? [])
    return super.set(key, value, options)
  }
}

const buildInterceptor = (cache: InspectableCache) => {
  const admin = new ModernAdmin({
    databases: [[{ name: 'users', rows: [{ id: '1', name: 'Ann' }] }] satisfies FakeTable[]],
    adapters: [adapter as never],
    cache,
  })
  return new ModernAdminCacheInterceptor(admin, new Reflector())
}

/** Stand-in route handler. `@NoHttpCache()` writes its metadata onto the
 *  function itself, which is exactly what `Reflector` reads back. */
const routeHandler = (): void => {}
class RouteController {}

const httpContext = (
  req: {
    method: string
    originalUrl: string
    params: Record<string, string>
    headers?: Record<string, string>
    currentAdmin?: CurrentAdmin
  },
  handler: () => void = routeHandler,
): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({ setHeader: () => {} }),
    }),
    getHandler: () => handler,
    getClass: () => RouteController,
  }) as unknown as ExecutionContext

const handlerReturning = (value: unknown): CallHandler & { calls: number } => {
  const handler = {
    calls: 0,
    handle() {
      handler.calls += 1
      return of(value)
    },
  }
  return handler
}

const listReq = (currentAdmin?: CurrentAdmin) => ({
  method: 'GET',
  originalUrl: '/admin/api/resources/users',
  params: { resourceId: 'users' },
  ...(currentAdmin ? { currentAdmin } : {}),
})

describe('ModernAdminCacheInterceptor — principal scoping', () => {
  test('different roles never share a cached response', async () => {
    const cache = new InspectableCache()
    const interceptor = buildInterceptor(cache)

    const adminHandler = handlerReturning({ records: ['full payload'] })
    const adminBody = await firstValueFrom(
      interceptor.intercept(httpContext(listReq({ id: 'a1', role: 'admin' })), adminHandler),
    )
    expect(adminBody).toEqual({ records: ['full payload'] })

    // A viewer with restricted property visibility must NOT receive the
    // admin's cached body — the handler must run again for their scope.
    const viewerHandler = handlerReturning({ records: ['redacted payload'] })
    const viewerBody = await firstValueFrom(
      interceptor.intercept(httpContext(listReq({ id: 'v1', role: 'viewer' })), viewerHandler),
    )
    expect(viewerHandler.calls).toBe(1)
    expect(viewerBody).toEqual({ records: ['redacted payload'] })

    expect(cache.keys).toEqual([
      'v1:nest:GET:/admin/api/resources/users:user:a1',
      'v1:nest:GET:/admin/api/resources/users:user:v1',
    ])
  })

  test('different users with the same role do not share a cached response', async () => {
    const cache = new InspectableCache()
    const interceptor = buildInterceptor(cache)

    const first = handlerReturning({ records: [1] })
    await firstValueFrom(
      interceptor.intercept(httpContext(listReq({ id: 'a1', role: 'admin' })), first),
    )
    const second = handlerReturning({ records: ['never used'] })
    const body = await firstValueFrom(
      interceptor.intercept(httpContext(listReq({ id: 'a2', role: 'admin' })), second),
    )
    expect(second.calls).toBe(1)
    expect(body).toEqual({ records: ['never used'] })
  })

  test('functional property access rules force HTTP cache bypass', async () => {
    const cache = new InspectableCache()
    const admin = new ModernAdmin({
      adapters: [adapter as never],
      cache,
      resources: [
        {
          resource: { name: 'users', rows: [{ id: '1', name: 'Ann' }] },
          options: {
            properties: {
              name: {
                isAccessible: ({ currentAdmin }: PropertyContext) => currentAdmin?.id === 'a1',
              },
            },
          },
        },
      ],
    })
    const interceptor = new ModernAdminCacheInterceptor(admin, new Reflector())
    const principal = { id: 'a1', role: 'admin' }
    await firstValueFrom(
      interceptor.intercept(httpContext(listReq(principal)), handlerReturning({ records: [1] })),
    )
    const second = handlerReturning({ records: [2] })
    await expect(
      firstValueFrom(interceptor.intercept(httpContext(listReq(principal)), second)),
    ).resolves.toEqual({ records: [2] })
    expect(second.calls).toBe(1)
    expect(cache.keys).toEqual([])
  })

  test('role revocation invalidates HTTP responses before they can bypass authorization', async () => {
    const cache = new InspectableCache()
    const admin = new ModernAdmin({
      databases: [
        [
          { name: 'users', rows: [{ id: '1', name: 'Ann' }] },
          { name: 'roles', rows: [{ id: 'editor', permissions: { users: ['list'] } }] },
        ] satisfies FakeTable[],
      ],
      adapters: [adapter as never],
      cache,
      rolesResourceId: 'roles',
    })
    const interceptor = new ModernAdminCacheInterceptor(admin, new Reflector())
    const principal = { id: 'a1', role: 'editor' }
    await firstValueFrom(
      interceptor.intercept(httpContext(listReq(principal)), handlerReturning({ records: [1] })),
    )
    const key = 'v1:nest:GET:/admin/api/resources/users:user:a1'
    expect(cache.tagsByKey.get(key)).toEqual(['list:users', 'role-perms', 'role-perms:editor'])

    await admin.invalidateRolePermissionsCache()
    const second = handlerReturning({ records: [2] })
    await firstValueFrom(interceptor.intercept(httpContext(listReq(principal)), second))
    expect(second.calls).toBe(1)
  })

  test('the same user hits its cached response', async () => {
    const cache = new InspectableCache()
    const interceptor = buildInterceptor(cache)
    const principal = { id: 'a1', role: 'admin' }
    await firstValueFrom(
      interceptor.intercept(httpContext(listReq(principal)), handlerReturning({ records: [1] })),
    )
    const next = handlerReturning({ records: ['never used'] })
    const body = await firstValueFrom(interceptor.intercept(httpContext(listReq(principal)), next))
    expect(next.calls).toBe(0)
    expect(body).toEqual({ records: [1] })
  })

  test('api-key principals are scoped per key, ahead of role', async () => {
    const cache = new InspectableCache()
    const interceptor = buildInterceptor(cache)
    await firstValueFrom(
      interceptor.intercept(
        httpContext(listReq({ id: 's1', role: 'admin', apiKey: { id: 'k-123', permissions: {} } })),
        handlerReturning({ ok: true }),
      ),
    )
    expect(cache.keys).toEqual(['v1:nest:GET:/admin/api/resources/users:key:k-123'])
  })

  test('anonymous requests use the anon scope', async () => {
    const cache = new InspectableCache()
    const interceptor = buildInterceptor(cache)
    await firstValueFrom(
      interceptor.intercept(httpContext(listReq()), handlerReturning({ ok: true })),
    )
    expect(cache.keys).toEqual(['v1:nest:GET:/admin/api/resources/users:anon'])
  })

  test('@NoHttpCache() handlers bypass the cache entirely', async () => {
    // The custom-action GET routes wear this marker: their body is produced
    // by user code we hold no invalidation tags for, so replaying it would
    // be wrong even within a single principal scope.
    const cache = new InspectableCache()
    const interceptor = buildInterceptor(cache)
    const primeAction = (): void => {}
    NoHttpCache()(primeAction)

    const first = handlerReturning({ templates: ['welcome'] })
    await firstValueFrom(interceptor.intercept(httpContext(listReq(), primeAction), first))
    const second = handlerReturning({ templates: ['changed'] })
    const body = await firstValueFrom(
      interceptor.intercept(httpContext(listReq(), primeAction), second),
    )

    expect(cache.keys).toEqual([])
    expect(second.calls).toBe(1)
    expect(body).toEqual({ templates: ['changed'] })
  })

  test('unmarked handlers on the same controller still cache', async () => {
    const cache = new InspectableCache()
    const interceptor = buildInterceptor(cache)
    await firstValueFrom(
      interceptor.intercept(httpContext(listReq()), handlerReturning({ ok: true })),
    )
    expect(cache.keys).toEqual(['v1:nest:GET:/admin/api/resources/users:anon'])
  })

  // The list view's refresh button sends `Cache-Control: no-cache`. It must
  // reach the controller (which forwards `refresh` into the action) instead
  // of being answered from the response cache.
  test('Cache-Control: no-cache runs the handler and refreshes the entry', async () => {
    const cache = new InspectableCache()
    const interceptor = buildInterceptor(cache)

    await firstValueFrom(
      interceptor.intercept(httpContext(listReq()), handlerReturning({ records: [1] })),
    )
    const revalidated = handlerReturning({ records: [1, 2] })
    const body = await firstValueFrom(
      interceptor.intercept(
        httpContext({ ...listReq(), headers: { 'cache-control': 'no-cache' } }),
        revalidated,
      ),
    )

    expect(revalidated.calls).toBe(1)
    expect(body).toEqual({ records: [1, 2] })
    // …and the entry now holds the fresh body, so the next plain GET hits it.
    const next = handlerReturning({ records: ['never used'] })
    const cached = await firstValueFrom(interceptor.intercept(httpContext(listReq()), next))
    expect(next.calls).toBe(0)
    expect(cached).toEqual({ records: [1, 2] })
  })

  test('ordinary requests without the header still hit the cache', async () => {
    const cache = new InspectableCache()
    const interceptor = buildInterceptor(cache)
    await firstValueFrom(
      interceptor.intercept(
        httpContext({ ...listReq(), headers: { accept: 'application/json' } }),
        handlerReturning({ records: [1] }),
      ),
    )
    const second = handlerReturning({ records: ['never used'] })
    const body = await firstValueFrom(
      interceptor.intercept(httpContext({ ...listReq(), headers: {} }), second),
    )
    expect(second.calls).toBe(0)
    expect(body).toEqual({ records: [1] })
  })

  test('record-scoped entries carry per-record + resource-wide tags', async () => {
    const cache = new InspectableCache()
    const interceptor = buildInterceptor(cache)
    await firstValueFrom(
      interceptor.intercept(
        httpContext({
          method: 'GET',
          originalUrl: '/admin/api/resources/users/records/1',
          params: { resourceId: 'users', recordId: '1' },
        }),
        handlerReturning({ record: { id: '1' } }),
      ),
    )
    const key = 'v1:nest:GET:/admin/api/resources/users/records/1:anon'
    expect(cache.tagsByKey.get(key)).toEqual(['record:users:1', 'records:users'])
  })

  test('does not cache an HTTP response computed before tag invalidation', async () => {
    const cache = new InspectableCache()
    const interceptor = buildInterceptor(cache)
    let release!: (value: { records: number[] }) => void
    const response = new Promise<{ records: number[] }>((resolve) => {
      release = resolve
    })
    const slowHandler: CallHandler = { handle: () => from(response) }
    const pending = firstValueFrom(interceptor.intercept(httpContext(listReq()), slowHandler))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await cache.invalidateTag('list:users')
    release({ records: [1] })
    await expect(pending).resolves.toEqual({ records: [1] })

    const next = handlerReturning({ records: [1, 2] })
    await firstValueFrom(interceptor.intercept(httpContext(listReq()), next))
    expect(next.calls).toBe(1)
  })
})

describe('canonicalHttpUrl', () => {
  test('normalises query parameter order and keeps repeated value order', () => {
    expect(canonicalHttpUrl('/admin/api/resources/users?perPage=20&page=1')).toBe(
      '/admin/api/resources/users?page=1&perPage=20',
    )
    expect(canonicalHttpUrl('/x?tag=b&tag=a')).toBe('/x?tag=b&tag=a')
  })
})
