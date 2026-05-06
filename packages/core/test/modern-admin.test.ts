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
  ListActionResponse,
  RecordActionResponse,
} from '../src/actions'
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

  test('toJSON exposes a UI-safe configuration snapshot', () => {
    const admin = buildAdmin([{ name: 'users', rows: [] }])
    const json = admin.toJSON()
    expect(json.rootPath).toBe('/admin')
    expect(json.resources).toHaveLength(1)
    expect(json.resources[0]!.id).toBe('users')
  })
})
