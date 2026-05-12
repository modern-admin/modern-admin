import { describe, expect, test } from 'bun:test'
import { BadRequestException, ForbiddenException, NotImplementedException } from '@nestjs/common'
import { ModernAdmin } from '@modern-admin/core'
import { ApiKeysController, type IApiKeyService } from '../src/api-keys.controller.js'
import { FakeDatabase, FakeResource, type FakeTable } from './_helpers/fake-adapter.js'

const adapter = { Database: FakeDatabase, Resource: FakeResource } as never

const buildAdmin = (tables: FakeTable[]) =>
  new ModernAdmin({ databases: [tables], adapters: [adapter] })

interface ServiceCalls {
  list: number
  create: Array<Parameters<IApiKeyService['create']>[0]>
  update: Array<Parameters<IApiKeyService['update']>[0]>
  delete: string[]
}

const fakeRow = (overrides: Partial<{ id: string; name: string | null; permissions: Record<string, string[]> }> = {}) => ({
  id: overrides.id ?? 'k1',
  name: overrides.name ?? 'Key 1',
  start: 'abc12',
  prefix: null,
  enabled: true,
  permissions: overrides.permissions ?? { users: ['list'] },
  expiresAt: null,
  lastRequest: null,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
})

const buildService = (): { service: IApiKeyService; calls: ServiceCalls } => {
  const calls: ServiceCalls = { list: 0, create: [], update: [], delete: [] }
  const service: IApiKeyService = {
    async list() {
      calls.list += 1
      return [fakeRow()]
    },
    async create(body) {
      calls.create.push(body)
      return { ...fakeRow({ id: 'k_new', name: body.name, permissions: body.permissions }), key: 'plaintext-secret-xyz' }
    },
    async update(body) {
      calls.update.push(body)
      return fakeRow({ id: body.keyId, name: body.name ?? null, permissions: body.permissions ?? undefined })
    },
    async delete(keyId) {
      calls.delete.push(keyId)
      return { success: true }
    },
  }
  return { service, calls }
}

const sessionReq = (apiKey?: { id: string; permissions: Record<string, string[]> }) => ({
  currentAdmin: { id: 'u1', email: 'u@example.com', ...(apiKey ? { apiKey } : {}) },
  headers: { cookie: 'session=abc' },
})

describe('ApiKeysController', () => {
  test('list returns mapped rows', async () => {
    const admin = buildAdmin([{ name: 'users', rows: [] }])
    const { service, calls } = buildService()
    const ctrl = new ApiKeysController(admin, service)
    const res = await ctrl.list(sessionReq())
    expect(calls.list).toBe(1)
    expect(res.keys).toHaveLength(1)
    expect(res.keys[0]!.id).toBe('k1')
    expect(res.keys[0]!.permissions).toEqual({ users: ['list'] })
    expect(res.keys[0]!.createdAt).toBe('2025-01-01T00:00:00.000Z')
  })

  test('list accepts envelope responses with a keys array', async () => {
    const admin = buildAdmin([{ name: 'users', rows: [] }])
    const ctrl = new ApiKeysController(admin, {
      async list() {
        return { keys: [fakeRow({ id: 'k_env' })] }
      },
      async create(body) {
        return { ...fakeRow({ id: 'k_new', name: body.name, permissions: body.permissions }), key: 'plaintext-secret-xyz' }
      },
      async update(body) {
        return fakeRow({ id: body.keyId, name: body.name ?? null, permissions: body.permissions ?? undefined })
      },
      async delete() {
        return { success: true }
      },
    })
    const res = await ctrl.list(sessionReq())
    expect(res.keys).toHaveLength(1)
    expect(res.keys[0]!.id).toBe('k_env')
  })

  test('list rejects requests authenticated via an API key', async () => {
    const admin = buildAdmin([{ name: 'users', rows: [] }])
    const { service } = buildService()
    const ctrl = new ApiKeysController(admin, service)
    await expect(
      ctrl.list(sessionReq({ id: 'k_self', permissions: { '*': ['*'] } })),
    ).rejects.toThrow(ForbiddenException)
  })

  test('list rejects unauthenticated requests', async () => {
    const admin = buildAdmin([{ name: 'users', rows: [] }])
    const { service } = buildService()
    const ctrl = new ApiKeysController(admin, service)
    await expect(
      ctrl.list({ headers: {} } as never),
    ).rejects.toThrow(ForbiddenException)
  })

  test('list throws 501 when no service is registered', async () => {
    const admin = buildAdmin([{ name: 'users', rows: [] }])
    const ctrl = new ApiKeysController(admin)
    await expect(ctrl.list(sessionReq())).rejects.toThrow(NotImplementedException)
  })

  test('create rejects invalid payloads', async () => {
    const admin = buildAdmin([{ name: 'users', rows: [] }])
    const { service } = buildService()
    const ctrl = new ApiKeysController(admin, service)
    await expect(
      ctrl.create({ name: '', permissions: {} } as unknown, sessionReq()),
    ).rejects.toThrow(BadRequestException)
  })

  test('create rejects unknown resources in permissions', async () => {
    const admin = buildAdmin([{ name: 'users', rows: [] }])
    const { service } = buildService()
    const ctrl = new ApiKeysController(admin, service)
    await expect(
      ctrl.create(
        { name: 'CI bot', permissions: { posts: ['list'] } } as unknown,
        sessionReq(),
      ),
    ).rejects.toThrow(/Unknown resource: posts/)
  })

  test('create rejects unknown actions in permissions', async () => {
    const admin = buildAdmin([{ name: 'users', rows: [] }])
    const { service } = buildService()
    const ctrl = new ApiKeysController(admin, service)
    await expect(
      ctrl.create(
        { name: 'CI bot', permissions: { users: ['noSuchAction'] } } as unknown,
        sessionReq(),
      ),
    ).rejects.toThrow(/Unknown action "noSuchAction"/)
  })

  test('create accepts record-level and bulk actions (show/edit/delete/bulkDelete)', async () => {
    const admin = buildAdmin([{ name: 'users', rows: [] }])
    const { service, calls } = buildService()
    const ctrl = new ApiKeysController(admin, service)
    await ctrl.create(
      {
        name: 'mixed',
        permissions: { users: ['list', 'show', 'edit', 'new', 'delete', 'bulkDelete'] },
      } as unknown,
      sessionReq(),
    )
    expect(calls.create).toHaveLength(1)
    expect(calls.create[0]!.permissions.users).toEqual([
      'list',
      'show',
      'edit',
      'new',
      'delete',
      'bulkDelete',
    ])
  })

  test('create accepts wildcard resource and action keys', async () => {
    const admin = buildAdmin([{ name: 'users', rows: [] }])
    const { service, calls } = buildService()
    const ctrl = new ApiKeysController(admin, service)
    const res = await ctrl.create(
      { name: 'wild', permissions: { '*': ['*'] } } as unknown,
      sessionReq(),
    )
    expect(res.key).toBe('plaintext-secret-xyz')
    expect(calls.create).toHaveLength(1)
    expect(calls.create[0]!.permissions).toEqual({ '*': ['*'] })
  })

  test('create converts expiresInDays to milliseconds', async () => {
    const admin = buildAdmin([{ name: 'users', rows: [] }])
    const { service, calls } = buildService()
    const ctrl = new ApiKeysController(admin, service)
    await ctrl.create(
      { name: 'expiring', expiresInDays: 7, permissions: { users: ['list'] } } as unknown,
      sessionReq(),
    )
    expect(calls.create[0]!.expiresIn).toBe(7 * 24 * 60 * 60 * 1000)
  })

  test('create with explicit null expiresInDays passes null to the service', async () => {
    const admin = buildAdmin([{ name: 'users', rows: [] }])
    const { service, calls } = buildService()
    const ctrl = new ApiKeysController(admin, service)
    await ctrl.create(
      { name: 'forever', expiresInDays: null, permissions: { users: ['list'] } } as unknown,
      sessionReq(),
    )
    expect(calls.create[0]!.expiresIn).toBeNull()
  })

  test('update only forwards the fields it received', async () => {
    const admin = buildAdmin([{ name: 'users', rows: [] }])
    const { service, calls } = buildService()
    const ctrl = new ApiKeysController(admin, service)
    await ctrl.update('k1', { enabled: false } as unknown, sessionReq())
    expect(calls.update[0]).toEqual({ keyId: 'k1', enabled: false })
  })

  test('update with explicit null expiresInDays clears the expiry', async () => {
    const admin = buildAdmin([{ name: 'users', rows: [] }])
    const { service, calls } = buildService()
    const ctrl = new ApiKeysController(admin, service)
    await ctrl.update('k1', { expiresInDays: null } as unknown, sessionReq())
    expect(calls.update[0]).toEqual({ keyId: 'k1', expiresIn: null })
  })

  test('update validates permissions when provided', async () => {
    const admin = buildAdmin([{ name: 'users', rows: [] }])
    const { service } = buildService()
    const ctrl = new ApiKeysController(admin, service)
    await expect(
      ctrl.update('k1', { permissions: { posts: ['list'] } } as unknown, sessionReq()),
    ).rejects.toThrow(BadRequestException)
  })

  test('delete forwards the id and returns success', async () => {
    const admin = buildAdmin([{ name: 'users', rows: [] }])
    const { service, calls } = buildService()
    const ctrl = new ApiKeysController(admin, service)
    const res = await ctrl.remove('k1', sessionReq())
    expect(res.success).toBe(true)
    expect(calls.delete).toEqual(['k1'])
  })

  test('delete rejects api-key authenticated callers', async () => {
    const admin = buildAdmin([{ name: 'users', rows: [] }])
    const { service } = buildService()
    const ctrl = new ApiKeysController(admin, service)
    await expect(
      ctrl.remove('k1', sessionReq({ id: 'k_self', permissions: { '*': ['*'] } })),
    ).rejects.toThrow(ForbiddenException)
  })
})
