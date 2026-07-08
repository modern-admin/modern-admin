// HTTP cache interceptor — principal isolation contract.
//
// Authorization gates and per-property redaction run inside
// `admin.invoke()`, downstream of the interceptor. On a HIT the handler
// never executes, so a cached body must only ever be replayed to
// principals with the same permission scope: same api key, same role, or
// both anonymous. These tests pin the key scheme that guarantees it and
// the tags that keep HTTP entries in lockstep with action-layer
// invalidation.

import { describe, expect, test } from 'bun:test'
import { firstValueFrom, of } from 'rxjs'
import type { CallHandler, ExecutionContext } from '@nestjs/common'
import {
  MemoryCacheProvider,
  ModernAdmin,
  type CurrentAdmin,
} from '@modern-admin/core'
import { ModernAdminCacheInterceptor } from '../src/cache.interceptor.js'
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
  return new ModernAdminCacheInterceptor(admin)
}

const httpContext = (req: {
  method: string
  originalUrl: string
  params: Record<string, string>
  currentAdmin?: CurrentAdmin
}): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({ setHeader: () => {} }),
    }),
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
      interceptor.intercept(
        httpContext(listReq({ id: 'a1', role: 'admin' })),
        adminHandler,
      ),
    )
    expect(adminBody).toEqual({ records: ['full payload'] })

    // A viewer with restricted property visibility must NOT receive the
    // admin's cached body — the handler must run again for their scope.
    const viewerHandler = handlerReturning({ records: ['redacted payload'] })
    const viewerBody = await firstValueFrom(
      interceptor.intercept(
        httpContext(listReq({ id: 'v1', role: 'viewer' })),
        viewerHandler,
      ),
    )
    expect(viewerHandler.calls).toBe(1)
    expect(viewerBody).toEqual({ records: ['redacted payload'] })

    expect(cache.keys).toEqual([
      'nest:GET:/admin/api/resources/users:role:admin',
      'nest:GET:/admin/api/resources/users:role:viewer',
    ])
  })

  test('same role shares the cached response (HIT skips the handler)', async () => {
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
    expect(second.calls).toBe(0)
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
    expect(cache.keys).toEqual(['nest:GET:/admin/api/resources/users:key:k-123'])
  })

  test('anonymous requests use the anon scope', async () => {
    const cache = new InspectableCache()
    const interceptor = buildInterceptor(cache)
    await firstValueFrom(
      interceptor.intercept(httpContext(listReq()), handlerReturning({ ok: true })),
    )
    expect(cache.keys).toEqual(['nest:GET:/admin/api/resources/users:anon'])
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
    const key = 'nest:GET:/admin/api/resources/users/records/1:anon'
    expect(cache.tagsByKey.get(key)).toEqual(['record:users:1', 'records:users'])
  })
})
