import { describe, expect, test } from 'bun:test'
import { Filter, ModernAdmin, type ActionRequest } from '@modern-admin/core'
import { ResourceController } from '../src/resource.controller.js'
import { FakeDatabase, FakeResource, type FakeTable } from './_helpers/fake-adapter.js'

interface Adapter {
  Database: typeof FakeDatabase
  Resource: typeof FakeResource
}

const adapter = { Database: FakeDatabase, Resource: FakeResource } as unknown as Adapter

const buildController = (tables: FakeTable[]): { controller: ResourceController; admin: ModernAdmin } => {
  const admin = new ModernAdmin({ databases: [tables], adapters: [adapter] as never })
  return { controller: new ResourceController(admin), admin }
}

const req = { currentAdmin: { id: 'me', role: 'admin' } }

/** Records every ActionRequest that reaches a custom handler, so the tests
 *  can assert on the exact shape the controller built from the HTTP call. */
const buildCustomActionController = (): {
  controller: ResourceController
  seen: ActionRequest[]
} => {
  const seen: ActionRequest[] = []
  const admin = new ModernAdmin({
    adapters: [adapter] as never,
    resources: [
      {
        resource: { name: 'users', rows: [{ id: '1', name: 'Ann' }, { id: '2', name: 'Bob' }] },
        options: {
          actions: {
            sendMassPush: {
              name: 'sendMassPush',
              actionType: 'resource' as const,
              component: 'SendMassPush',
              handler: async (request: ActionRequest) => {
                seen.push(request)
                return { notice: { message: 'ok', type: 'success' as const } }
              },
            },
            ping: {
              name: 'ping',
              actionType: 'record' as const,
              handler: async (request: ActionRequest) => {
                seen.push(request)
                return { pinged: true }
              },
            },
            tagAll: {
              name: 'tagAll',
              actionType: 'bulk' as const,
              handler: async (request: ActionRequest) => {
                seen.push(request)
                return { ok: true }
              },
            },
          },
        },
      },
    ],
  })
  return { controller: new ResourceController(admin), seen }
}

describe('ResourceController — custom actions', () => {
  test('POST actions/:action runs a resource action with the body as payload', async () => {
    const { controller, seen } = buildCustomActionController()
    const res = await controller.invokeResourceAction(
      'users',
      'sendMassPush',
      { title: 'Hi', body: 'There' },
      req,
    )
    expect(res.notice?.message).toBe('ok')
    expect(seen[0]?.method).toBe('post')
    expect(seen[0]?.payload).toEqual({ title: 'Hi', body: 'There' })
    expect(seen[0]?.params.recordId).toBeUndefined()
  })

  test('POST actions/:action lifts recordIds out of the body for bulk actions', async () => {
    const { controller, seen } = buildCustomActionController()
    await controller.invokeResourceAction('users', 'tagAll', { recordIds: ['1', '2'], tag: 'vip' }, req)
    expect(seen[0]?.params.recordIds).toBe('1,2')
    expect(seen[0]?.payload).toEqual({ tag: 'vip' })
  })

  test('POST records/:recordId/actions/:action forwards the record id and payload', async () => {
    const { controller, seen } = buildCustomActionController()
    const res = await controller.invokeRecordAction('users', '1', 'ping', { note: 'hey' }, req)
    expect(res.pinged).toBe(true)
    expect(seen[0]?.params.recordId).toBe('1')
    expect(seen[0]?.payload).toEqual({ note: 'hey' })
  })

  test('GET actions/:action primes a resource action with method "get"', async () => {
    const { controller, seen } = buildCustomActionController()
    await controller.fetchResourceAction('users', 'sendMassPush', { preview: '1' }, req)
    expect(seen[0]?.method).toBe('get')
    expect(seen[0]?.query).toEqual({ preview: '1' })
    // A priming call carries no payload — handlers branch on the method.
    expect(seen[0]?.payload).toBeUndefined()
  })

  test('GET actions/:action lifts recordIds out of the query string', async () => {
    const { controller, seen } = buildCustomActionController()
    await controller.fetchResourceAction('users', 'tagAll', { recordIds: '1,2', preview: '1' }, req)
    expect(seen[0]?.params.recordIds).toBe('1,2')
    expect(seen[0]?.query).toEqual({ preview: '1' })
  })

  test('GET records/:recordId/actions/:action primes a record action', async () => {
    const { controller, seen } = buildCustomActionController()
    await controller.fetchRecordAction('users', '2', 'ping', {}, req)
    expect(seen[0]?.method).toBe('get')
    expect(seen[0]?.params.recordId).toBe('2')
  })

  test('the priming GET does not shadow the built-in list route', async () => {
    // `actions/list` is declared before the catch-all, so the built-in
    // handler must keep winning for that name.
    const { controller } = buildController([{ name: 'users', rows: [{ id: '1' }] }])
    const res = (await controller.list('users', {}, req)) as { meta: { total: number } }
    expect(res.meta.total).toBe(1)
  })
})

describe('ResourceController', () => {
  test('list returns paginated records', async () => {
    const { controller } = buildController([
      { name: 'users', rows: [{ id: '1', name: 'Ann' }, { id: '2', name: 'Bob' }] },
    ])
    const res = (await controller.list('users', { page: '1', perPage: '10' }, req)) as {
      records: Array<{ id: string }>
      meta: { total: number }
    }
    expect(res.records).toHaveLength(2)
    expect(res.meta.total).toBe(2)
  })

  test('show returns a single record', async () => {
    const { controller } = buildController([{ name: 'users', rows: [{ id: '1', name: 'Ann' }] }])
    const res = (await controller.show('users', '1', req)) as { record: { id: string } }
    expect(res.record.id).toBe('1')
  })

  test('create persists a new record', async () => {
    const { controller, admin } = buildController([{ name: 'users', rows: [] }])
    await controller.create('users', { name: 'New' }, req)
    expect((await admin.findResource('users').findOne('1'))?.id()).toBe('1')
  })

  test('edit updates fields', async () => {
    const { controller, admin } = buildController([{ name: 'users', rows: [{ id: '1', name: 'Ann' }] }])
    await controller.edit('users', '1', { name: 'Renamed' }, req)
    const rec = await admin.findResource('users').findOne('1')
    expect(rec?.get('name')).toBe('Renamed')
  })

  test('remove deletes a record', async () => {
    const { controller, admin } = buildController([{ name: 'users', rows: [{ id: '1', name: 'A' }] }])
    await controller.remove('users', '1', req)
    expect(await admin.findResource('users').findOne('1')).toBeNull()
  })

  test('bulkDelete removes multiple records', async () => {
    const { controller, admin } = buildController([
      { name: 'users', rows: [{ id: '1' }, { id: '2' }, { id: '3' }] },
    ])
    await controller.bulkDelete('users', { recordIds: ['1', '3'] }, req)
    const resource = admin.findResource('users')
    const remaining = await resource.count(new Filter(undefined, resource))
    expect(remaining).toBe(1)
  })

  test('list rejects malformed query through Zod', async () => {
    const { controller } = buildController([{ name: 'users', rows: [] }])
    await expect(
      controller.list('users', { page: 'not-a-number' }, req),
    ).rejects.toBeDefined()
  })

  test('unknown action maps to NotFoundException', async () => {
    const { controller } = buildController([{ name: 'users', rows: [] }])
    try {
      await controller.invokeResourceAction('users', 'nope', {}, req)
      throw new Error('expected throw')
    } catch (err: unknown) {
      const e = err as { status?: number }
      expect(e.status).toBe(404)
    }
  })

  test('unknown resource maps to NotFoundException', async () => {
    const { controller } = buildController([{ name: 'users', rows: [] }])
    try {
      await controller.show('missing', '1', req)
      throw new Error('expected throw')
    } catch (err: unknown) {
      const e = err as { status?: number }
      expect(e.status).toBe(404)
    }
  })
})
