import { describe, expect, test } from 'bun:test'
import { Filter, ModernAdmin } from '@modern-admin/core'
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
