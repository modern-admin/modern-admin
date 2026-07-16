import { describe, expect, test } from 'bun:test'
import { ModernAdmin } from '../src/modern-admin.js'
import { InMemoryRealtimeBus, type RealtimeEvent } from '../src/ports'
import {
  ActionNotFoundError,
  ResourceNotFoundError,
  ForbiddenError,
} from '../src/errors'
import type {
  Action,
  ActionRequest,
  BulkActionResponse,
  ListActionResponse,
  RecordActionResponse,
} from '../src/actions'
import { BaseProperty } from '../src/adapters/base-property.js'
import type { PropertyContext } from '../src/decorators/property-options.js'
import type { Adapter } from '../src/factories/resources-factory.js'
import { FakeDatabase, FakeResource, type FakeTable } from './_helpers/fake-adapter.js'

const adapter = { Database: FakeDatabase, Resource: FakeResource } as unknown as Adapter

const buildAdmin = (tables: FakeTable[]) =>
  new ModernAdmin({
    databases: [tables],
    adapters: [adapter],
  })

const listRequest = (resourceId: string): ActionRequest => ({
  params: { resourceId, action: 'list' },
  method: 'get',
  query: {},
})

describe('ModernAdmin', () => {
  test('exposes built-in resources via findResource()', () => {
    const admin = buildAdmin([{ name: 'users', rows: [{ id: '1', name: 'Ann' }] }])
    expect(admin.findResource('users').id()).toBe('users')
    expect(() => admin.findResource('missing')).toThrow(ResourceNotFoundError)
  })

  test('invoke runs the list action and returns paginated records', async () => {
    const admin = buildAdmin([
      {
        name: 'users',
        rows: [
          { id: '1', name: 'Ann' },
          { id: '2', name: 'Bob' },
        ],
      },
    ])
    const res = await admin.invoke<ListActionResponse>(listRequest('users'))
    expect(res.records).toHaveLength(2)
    expect(res.meta.total).toBe(2)
    expect(res.meta.page).toBe(1)
  })

  test('invoke throws ActionNotFoundError for unknown actions', async () => {
    const admin = buildAdmin([{ name: 'users', rows: [] }])
    await expect(
      admin.invoke({
        params: { resourceId: 'users', action: 'no-such-action' },
        method: 'get',
      }),
    ).rejects.toThrow(ActionNotFoundError)
  })

  test('invoke loads a record for record-type actions', async () => {
    const admin = buildAdmin([{ name: 'users', rows: [{ id: '1', name: 'Ann' }] }])
    const res = await admin.invoke<RecordActionResponse>({
      params: { resourceId: 'users', action: 'show', recordId: '1' },
      method: 'get',
    })
    expect(res.record.id).toBe('1')
    expect(res.record.params.name).toBe('Ann')
  })

  test('invoke runs before and after hooks', async () => {
    const admin = buildAdmin([{ name: 'users', rows: [] }])
    const action = admin
      .findResource('users')
      .decorate()
      .getAction('list')!
    const order: string[] = []
    const merged = action.merged as unknown as Action<ListActionResponse>
    merged.before = async (req) => {
      order.push('before')
      return req
    }
    merged.after = async (resp) => {
      order.push('after')
      return resp
    }
    await admin.invoke<ListActionResponse>(listRequest('users'))
    expect(order).toEqual(['before', 'after'])
  })

  test('invoke throws ForbiddenError when isAccessible returns false', async () => {
    const admin = buildAdmin([{ name: 'users', rows: [] }])
    const action = admin.findResource('users').decorate().getAction('list')!
    ;(action.merged as Action).isAccessible = false
    await expect(admin.invoke(listRequest('users'))).rejects.toThrow(ForbiddenError)
  })

  test('invoke publishes a realtime event after a create action', async () => {
    const bus = new InMemoryRealtimeBus()
    const received: RealtimeEvent[] = []
    await bus.subscribe((e) => {
      received.push(e)
    })
    const admin = new ModernAdmin({
      databases: [[{ name: 'users', rows: [] }]],
      adapters: [adapter],
      realtime: bus,
    })
    await admin.invoke<RecordActionResponse>({
      params: { resourceId: 'users', action: 'new' },
      method: 'post',
      payload: { name: 'Carla' },
    })
    expect(received).toHaveLength(1)
    expect(received[0]!.kind).toBe('created')
    expect(received[0]!.resourceId).toBe('users')
  })

  test('invoke publishes a deleted event for each id in a bulkDelete', async () => {
    const bus = new InMemoryRealtimeBus()
    const received: RealtimeEvent[] = []
    await bus.subscribe((e) => {
      received.push(e)
    })
    const admin = new ModernAdmin({
      databases: [[{ name: 'users', rows: [{ id: '1' }, { id: '2' }] }]],
      adapters: [adapter],
      realtime: bus,
    })
    await admin.invoke({
      params: { resourceId: 'users', action: 'bulkDelete', recordIds: '1,2' },
      method: 'post',
    })
    expect(received).toHaveLength(2)
    expect(received.map((e) => e.recordId).sort()).toEqual(['1', '2'])
    expect(received.every((e) => e.kind === 'deleted')).toBe(true)
  })

  test('bulkDelete routes each record through the delete hook chain', async () => {
    const admin = buildAdmin([
      { name: 'users', rows: [{ id: '1', name: 'Ann' }, { id: '2', name: 'Bob' }] },
    ])
    const deleteAction = admin.findResource('users').decorate().getAction('delete')!
    const merged = deleteAction.merged as unknown as Action<RecordActionResponse>
    const calls: Array<{ phase: string; recordId?: string; ctxRecordId?: string }> = []
    merged.before = async (req, ctx) => {
      calls.push({
        phase: 'before',
        ...(req.params.recordId !== undefined ? { recordId: req.params.recordId } : {}),
        ...(ctx.record ? { ctxRecordId: String(ctx.record.id()) } : {}),
      })
      return req
    }
    merged.after = async (resp, req, ctx) => {
      calls.push({
        phase: 'after',
        ...(req.params.recordId !== undefined ? { recordId: req.params.recordId } : {}),
        ...(ctx.record ? { ctxRecordId: String(ctx.record.id()) } : {}),
      })
      return resp
    }
    const res = await admin.invoke<BulkActionResponse>({
      params: { resourceId: 'users', action: 'bulkDelete', recordIds: '1,2' },
      method: 'post',
    })
    expect(res.records).toHaveLength(2)
    expect(calls).toEqual([
      { phase: 'before', recordId: '1', ctxRecordId: '1' },
      { phase: 'after', recordId: '1', ctxRecordId: '1' },
      { phase: 'before', recordId: '2', ctxRecordId: '2' },
      { phase: 'after', recordId: '2', ctxRecordId: '2' },
    ])
    expect(await admin.findResource('users').findOne('1')).toBeNull()
    expect(await admin.findResource('users').findOne('2')).toBeNull()
  })

  test('toJSON exposes a UI-safe configuration snapshot', () => {
    const admin = buildAdmin([{ name: 'users', rows: [] }])
    const json = admin.toJSON()
    expect(json.rootPath).toBe('/admin')
    expect(json.resources).toHaveLength(1)
    expect(json.resources[0]!.id).toBe('users')
  })

  test('navigation without a name stays visible with the default icon', () => {
    const admin = new ModernAdmin({
      resources: [
        {
          resource: { name: 'users', rows: [] },
          options: { id: 'users', navigation: {} },
        },
      ],
      adapters: [adapter],
    })
    expect(admin.toJSON().resources[0]!.navigation).toEqual({ icon: 'Database' })
  })

  test('toJSON filters properties when isAccessible denies the current admin', async () => {
    const admin = new ModernAdmin({
      resources: [
        {
          resource: {
            name: 'users',
            rows: [],
            properties: [
              new BaseProperty({ path: 'id', isId: true }),
              new BaseProperty({ path: 'name' }),
              new BaseProperty({ path: 'salary', type: 'number' }),
            ],
          },
          options: {
            id: 'users',
            properties: {
              salary: {
                isAccessible: (ctx: PropertyContext) => ctx.currentAdmin?.role === 'hr',
              },
            },
          },
        },
      ],
      adapters: [adapter],
    })
    const json = await admin.toJSON({ id: 'u1', role: 'viewer' })
    expect(json.resources[0]!.properties.map((p) => p.path)).toEqual(['id', 'name'])
  })

  test('invoke strips inaccessible properties from built-in action responses', async () => {
    const admin = new ModernAdmin({
      resources: [
        {
          resource: {
            name: 'users',
            rows: [{ id: '1', name: 'Ann', salary: 100 }],
            properties: [
              new BaseProperty({ path: 'id', isId: true }),
              new BaseProperty({ path: 'name' }),
              new BaseProperty({ path: 'salary', type: 'number' }),
            ],
          },
          options: {
            id: 'users',
            properties: {
              salary: {
                isAccessible: (ctx: PropertyContext) => ctx.currentAdmin?.role === 'hr',
              },
            },
          },
        },
      ],
      adapters: [adapter],
    })
    const res = await admin.invoke<ListActionResponse>(
      listRequest('users'),
      { id: 'u1', role: 'viewer' },
    )
    expect(res.records[0]!.params).toEqual({ id: '1', name: 'Ann' })
  })
})

describe('ModernAdmin api-key permission gate', () => {
  const adminWithKey = (permissions: Record<string, string[]>) => ({
    id: 'u1',
    email: 'u@example.com',
    apiKey: { id: 'key_1', permissions },
  })

  test('allows action when permissions include the resource and action', async () => {
    const admin = buildAdmin([{ name: 'users', rows: [{ id: '1', name: 'Ann' }] }])
    const res = await admin.invoke<ListActionResponse>(listRequest('users'), adminWithKey({ users: ['list'] }))
    expect(res.records).toHaveLength(1)
  })

  test('rejects action that is not in the permission allowlist', async () => {
    const admin = buildAdmin([{ name: 'users', rows: [] }])
    await expect(
      admin.invoke(listRequest('users'), adminWithKey({ users: ['show'] })),
    ).rejects.toThrow(ForbiddenError)
  })

  test('rejects all actions when the resource is not listed', async () => {
    const admin = buildAdmin([{ name: 'users', rows: [] }])
    await expect(
      admin.invoke(listRequest('users'), adminWithKey({ posts: ['list'] })),
    ).rejects.toThrow(ForbiddenError)
  })

  test('wildcard "*" action key opens all actions of a resource', async () => {
    const admin = buildAdmin([{ name: 'users', rows: [{ id: '1' }] }])
    const res = await admin.invoke<ListActionResponse>(listRequest('users'), adminWithKey({ users: ['*'] }))
    expect(res.records).toHaveLength(1)
  })

  test('wildcard "*" resource key opens all resources for the listed actions', async () => {
    const admin = buildAdmin([{ name: 'users', rows: [{ id: '1' }] }])
    const res = await admin.invoke<ListActionResponse>(listRequest('users'), adminWithKey({ '*': ['list'] }))
    expect(res.records).toHaveLength(1)
  })

  test('absence of an apiKey claim means the gate is open', async () => {
    const admin = buildAdmin([{ name: 'users', rows: [{ id: '1' }] }])
    const res = await admin.invoke<ListActionResponse>(listRequest('users'), {
      id: 'u1',
      email: 'u@example.com',
    })
    expect(res.records).toHaveLength(1)
  })
})

describe('ModernAdmin role permission gate', () => {
  const buildWithRoles = (roles: Array<{ id: string; permissions: Record<string, string[]> }>) =>
    new ModernAdmin({
      databases: [
        [
          { name: 'users', rows: [{ id: '1', name: 'Ann' }] },
          {
            name: 'roles',
            rows: roles.map((r) => ({ id: r.id, permissions: r.permissions })),
          },
        ],
      ],
      adapters: [adapter],
      rolesResourceId: 'roles',
    })

  test('allows when the principal\'s role grants the action', async () => {
    const admin = buildWithRoles([{ id: 'editor', permissions: { users: ['list'] } }])
    const res = await admin.invoke<ListActionResponse>(listRequest('users'), {
      id: 'u1',
      role: 'editor',
    })
    expect(res.records).toHaveLength(1)
  })

  test('rejects when the role exists but does not list the action', async () => {
    const admin = buildWithRoles([{ id: 'editor', permissions: { users: ['show'] } }])
    await expect(
      admin.invoke(listRequest('users'), { id: 'u1', role: 'editor' }),
    ).rejects.toThrow(ForbiddenError)
  })

  test('wildcard "*" resource key matches every resource', async () => {
    const admin = buildWithRoles([{ id: 'admin', permissions: { '*': ['*'] } }])
    const res = await admin.invoke<ListActionResponse>(listRequest('users'), {
      id: 'u1',
      role: 'admin',
    })
    expect(res.records).toHaveLength(1)
  })

  test('unknown role row is treated as no permissions configured (open gate)', async () => {
    // Same fail-open semantics as the api-key gate when no claim is set:
    // an admin with a role that doesn't resolve still authenticates, but
    // the matrix simply doesn't restrict them. Operators that want strict
    // deny-by-default should ensure every admin's role exists.
    const admin = buildWithRoles([{ id: 'editor', permissions: { users: ['list'] } }])
    const res = await admin.invoke<ListActionResponse>(listRequest('users'), {
      id: 'u1',
      role: 'ghost',
    })
    expect(res.records).toHaveLength(1)
  })

  test('denies anonymous principals (no role) when rolesResourceId is configured', async () => {
    // Security regression: configuring rolesResourceId opts into role
    // enforcement, so an unauthenticated caller whose principal carries no
    // role must be rejected — not waved through. Guards against the
    // fail-open GraphQL/transport path where currentAdmin is never populated.
    const admin = buildWithRoles([{ id: 'editor', permissions: { users: ['list'] } }])
    await expect(admin.invoke(listRequest('users'), { id: 'anon' })).rejects.toThrow(ForbiddenError)
    await expect(admin.invoke(listRequest('users'))).rejects.toThrow(ForbiddenError)
  })

  test('without rolesResourceId anonymous principals are still allowed', async () => {
    const admin = buildAdmin([{ name: 'users', rows: [{ id: '1' }] }])
    const res = await admin.invoke<ListActionResponse>(listRequest('users'))
    expect(res.records).toHaveLength(1)
  })

  test('without rolesResourceId the role gate is a no-op', async () => {
    const admin = buildAdmin([{ name: 'users', rows: [{ id: '1' }] }])
    const res = await admin.invoke<ListActionResponse>(listRequest('users'), {
      id: 'u1',
      role: 'editor',
    })
    expect(res.records).toHaveLength(1)
  })

  test('mutating the roles resource invalidates the permission cache', async () => {
    const admin = buildWithRoles([
      { id: 'editor', permissions: { users: ['list'] } },
      // A second role with full perms is needed to perform the mutation
      // itself — the role gate enforces permissions on `roles` writes too.
      { id: 'root', permissions: { '*': ['*'] } },
    ])
    // Prime the cache as the editor.
    await admin.invoke<ListActionResponse>(listRequest('users'), { id: 'u1', role: 'editor' })

    // Tighten the editor role to read-only via invoke (cache hook fires).
    await admin.invoke<RecordActionResponse>(
      {
        params: { resourceId: 'roles', action: 'edit', recordId: 'editor' },
        method: 'post',
        query: {},
        payload: { permissions: { users: ['show'] } },
      },
      { id: 'u2', role: 'root' },
    )

    // Now `list` must be denied for editor — proves cache was invalidated.
    await expect(
      admin.invoke(listRequest('users'), { id: 'u1', role: 'editor' }),
    ).rejects.toThrow(ForbiddenError)
  })
})
