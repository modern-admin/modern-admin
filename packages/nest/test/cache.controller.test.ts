import { describe, expect, test } from 'bun:test'
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { MemoryCacheProvider, ModernAdmin } from '@modern-admin/core'
import { CacheController } from '../src/cache.controller.js'
import { FakeDatabase, FakeResource } from './_helpers/fake-adapter.js'

const adapter = { Database: FakeDatabase, Resource: FakeResource } as never

const build = () => {
  const admin = new ModernAdmin({
    databases: [[{ name: 'users', rows: [{ id: '1', name: 'Ann' }] }]],
    adapters: [adapter],
    cache: new MemoryCacheProvider(),
    cacheRuntime: { metricsLogIntervalMs: 0 },
  })
  return { admin, controller: new CacheController(admin) }
}

const adminRequest = { currentAdmin: { id: 'u1', role: 'admin' } }

describe('CacheController', () => {
  test('returns and resets this replica metrics', async () => {
    const { admin, controller } = build()
    await admin.cacheRuntime.read(
      'v1:list:users:test',
      { enabled: true, ttl: 60, tags: ['list:users'] },
      async () => ({ ok: true }),
    )

    const before = controller.stats(adminRequest)
    expect(before.entries).toHaveLength(1)
    expect(before.entries[0]?.computes).toBe(1)
    const reset = controller.resetStats(adminRequest)
    expect(reset.entries).toEqual([])
    expect(controller.stats(adminRequest).entries).toEqual([])
  })

  test('invalidates an existing resource cache', async () => {
    const { admin, controller } = build()
    await admin.cacheRuntime.read(
      'v1:list:users:test',
      { enabled: true, ttl: 60, tags: ['list:users'] },
      async () => ({ ok: true }),
    )
    expect(await admin.cache.get('v1:list:users:test')).not.toBeNull()
    await expect(controller.invalidate({ resourceId: 'users' }, adminRequest)).resolves.toEqual({
      ok: true,
    })
    expect(await admin.cache.get('v1:list:users:test')).toBeNull()
  })

  test('rejects malformed and unknown resources', async () => {
    const { controller } = build()
    await expect(controller.invalidate({ resourceId: '' }, adminRequest)).rejects.toThrow(
      BadRequestException,
    )
    await expect(controller.invalidate({ resourceId: 'missing' }, adminRequest)).rejects.toThrow(
      NotFoundException,
    )
  })

  test('defaults to admin-only and rejects API-key principals', () => {
    const { controller } = build()
    expect(() => controller.stats({ currentAdmin: { id: 'u2', role: 'viewer' } })).toThrow(
      ForbiddenException,
    )
    expect(() =>
      controller.stats({
        currentAdmin: {
          id: 'u3',
          role: 'admin',
          apiKey: { id: 'key-1', permissions: { '*': ['*'] } },
        },
      }),
    ).toThrow(ForbiddenException)
  })

  test('supports an explicit operator role allowlist', () => {
    const { admin } = build()
    const controller = new CacheController(admin, { cacheRoles: ['operator'] })
    expect(controller.stats({ currentAdmin: { id: 'u4', role: 'operator' } }).instanceId).toBe(
      admin.cacheRuntime.instanceId,
    )
  })
})
