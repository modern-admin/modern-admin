// Tag invalidation contract across built-in read and mutation actions.
//
// Verifies that:
//   * list / search responses are tagged ONLY with `list:<resourceId>`
//   * show responses are tagged with `record:<resourceId>:<recordId>` plus
//     the resource-wide `records:<resourceId>` (used for cross-resource
//     invalidation)
//   * mutations (invalidated centrally by `invoke()` after after-hooks)
//     drop the right tags and leave unrelated entries alone
//   * mutating a referenced resource drops the caches of resources whose
//     responses embed it (populated references)
//   * custom actions invalidate via the declarative `invalidates` option
//
// In particular: editing record A should NOT drop the cached show of
// record B, and creating a new row should NOT drop any show cache.

import { describe, expect, test } from 'bun:test'
import { ModernAdmin } from '../src/modern-admin.js'
import { BaseProperty } from '../src/adapters/base-property.js'
import type { CacheSetOptions, ICacheProvider } from '../src/ports/cache-provider.js'
import type {
  ActionRequest,
  ListActionResponse,
  RecordActionResponse,
} from '../src/actions'
import type { Adapter } from '../src/factories/resources-factory.js'
import { FakeDatabase, FakeResource, type FakeTable } from './_helpers/fake-adapter.js'

const adapter = { Database: FakeDatabase, Resource: FakeResource } as unknown as Adapter

interface Entry { value: unknown; tags: string[] }

class FakeCache implements ICacheProvider {
  public readonly entries = new Map<string, Entry>()
  public readonly tags = new Map<string, Set<string>>()
  public invalidations: string[] = []
  async get<T>(key: string): Promise<T | null> {
    const row = this.entries.get(key)
    return row ? (row.value as T) : null
  }
  async set<T>(key: string, value: T, options: CacheSetOptions = {}): Promise<void> {
    const tags = options.tags ?? []
    this.entries.set(key, { value, tags })
    for (const tag of tags) {
      let bucket = this.tags.get(tag)
      if (!bucket) {
        bucket = new Set()
        this.tags.set(tag, bucket)
      }
      bucket.add(key)
    }
  }
  async del(key: string | string[]): Promise<void> {
    const list = Array.isArray(key) ? key : [key]
    for (const k of list) this.entries.delete(k)
  }
  async invalidateTag(tag: string | string[]): Promise<void> {
    const tags = Array.isArray(tag) ? tag : [tag]
    for (const t of tags) {
      this.invalidations.push(t)
      const bucket = this.tags.get(t)
      if (!bucket) continue
      for (const key of bucket) this.entries.delete(key)
      this.tags.delete(t)
    }
  }
}

const buildAdmin = (cache: ICacheProvider, tables: FakeTable[]) =>
  new ModernAdmin({ databases: [tables], adapters: [adapter], cache })

const listReq = (resourceId: string): ActionRequest => ({
  params: { resourceId, action: 'list' },
  method: 'get',
  query: {},
})

const showReq = (resourceId: string, recordId: string): ActionRequest => ({
  params: { resourceId, action: 'show', recordId },
  method: 'get',
})

describe('cache tag scheme — read actions', () => {
  test('list response is tagged only with list:<resourceId>', async () => {
    const cache = new FakeCache()
    const admin = buildAdmin(cache, [
      { name: 'users', rows: [{ id: '1', name: 'Ann' }] },
    ])
    await admin.invoke<ListActionResponse>(listReq('users'))
    expect(cache.entries.size).toBe(1)
    const entry = [...cache.entries.values()][0]!
    expect(entry.tags).toEqual(['list:users'])
  })

  test('show response is tagged with the per-record + resource-wide records tag', async () => {
    const cache = new FakeCache()
    const admin = buildAdmin(cache, [
      { name: 'users', rows: [{ id: '1', name: 'Ann' }] },
    ])
    await admin.invoke<RecordActionResponse>(showReq('users', '1'))
    expect(cache.entries.size).toBe(1)
    const entry = [...cache.entries.values()][0]!
    expect(entry.tags).toEqual(['record:users:1', 'records:users'])
  })

  test('search response is tagged with list:<resourceId>', async () => {
    const cache = new FakeCache()
    const admin = buildAdmin(cache, [
      { name: 'users', rows: [{ id: '1', name: 'Ann' }] },
    ])
    await admin.invoke<ListActionResponse>({
      params: { resourceId: 'users', action: 'search', query: 'Ann' },
      method: 'get',
    })
    const entries = [...cache.entries.values()]
    expect(entries.length).toBeGreaterThan(0)
    for (const e of entries) expect(e.tags).toEqual(['list:users'])
  })
})

describe('cache tag scheme — mutation invalidation', () => {
  test('new invalidates list only — show caches survive', async () => {
    const cache = new FakeCache()
    const admin = buildAdmin(cache, [
      { name: 'users', rows: [{ id: '1', name: 'Ann' }] },
    ])
    await admin.invoke(listReq('users'))
    await admin.invoke(showReq('users', '1'))
    expect(cache.entries.size).toBe(2)

    const created = await admin.invoke<RecordActionResponse>({
      params: { resourceId: 'users', action: 'new' },
      method: 'post',
      payload: { name: 'Bob' },
    })

    expect(cache.invalidations).toEqual([
      'list:users',
      `record:users:${created.record.id}`,
    ])
    // Show entry survives the insert; list entry is gone.
    const remaining = [...cache.entries.values()].map((e) => e.tags.join(','))
    expect(remaining).toEqual(['record:users:1,records:users'])
  })

  test('edit drops list + the edited record show — siblings survive', async () => {
    const cache = new FakeCache()
    const admin = buildAdmin(cache, [
      {
        name: 'users',
        rows: [
          { id: '1', name: 'Ann' },
          { id: '2', name: 'Bob' },
        ],
      },
    ])
    await admin.invoke(listReq('users'))
    await admin.invoke(showReq('users', '1'))
    await admin.invoke(showReq('users', '2'))
    expect(cache.entries.size).toBe(3)

    await admin.invoke({
      params: { resourceId: 'users', action: 'edit', recordId: '1' },
      method: 'post',
      payload: { name: 'Annette' },
    })

    expect(cache.invalidations).toEqual(['list:users', 'record:users:1'])
    // record:users:2 entry survives — its data did not change.
    const remaining = [...cache.entries.values()].map((e) => e.tags.join(','))
    expect(remaining).toEqual(['record:users:2,records:users'])
  })

  test('delete drops list + the deleted record show — siblings survive', async () => {
    const cache = new FakeCache()
    const admin = buildAdmin(cache, [
      {
        name: 'users',
        rows: [
          { id: '1', name: 'Ann' },
          { id: '2', name: 'Bob' },
        ],
      },
    ])
    await admin.invoke(listReq('users'))
    await admin.invoke(showReq('users', '1'))
    await admin.invoke(showReq('users', '2'))

    await admin.invoke({
      params: { resourceId: 'users', action: 'delete', recordId: '1' },
      method: 'post',
    })

    expect(cache.invalidations).toEqual(['list:users', 'record:users:1'])
    const remaining = [...cache.entries.values()].map((e) => e.tags.join(','))
    expect(remaining).toEqual(['record:users:2,records:users'])
  })

  test('bulkDelete drops list + each deleted record', async () => {
    const cache = new FakeCache()
    const admin = buildAdmin(cache, [
      {
        name: 'users',
        rows: [
          { id: '1', name: 'Ann' },
          { id: '2', name: 'Bob' },
          { id: '3', name: 'Cara' },
        ],
      },
    ])
    await admin.invoke(listReq('users'))
    await admin.invoke(showReq('users', '1'))
    await admin.invoke(showReq('users', '2'))
    await admin.invoke(showReq('users', '3'))

    await admin.invoke({
      params: { resourceId: 'users', action: 'bulkDelete', recordIds: '1,2' },
      method: 'post',
    })

    expect(cache.invalidations).toEqual([
      'list:users',
      'record:users:1',
      'record:users:2',
    ])
    const remaining = [...cache.entries.values()].map((e) => e.tags.join(','))
    expect(remaining).toEqual(['record:users:3,records:users'])
  })

  test('mutations on resource A do not invalidate resource B caches', async () => {
    const cache = new FakeCache()
    const admin = buildAdmin(cache, [
      { name: 'users', rows: [{ id: '1', name: 'Ann' }] },
      { name: 'orders', rows: [{ id: 'o1', name: 'first' }] },
    ])
    await admin.invoke(listReq('users'))
    await admin.invoke(showReq('users', '1'))
    await admin.invoke(listReq('orders'))
    expect(cache.entries.size).toBe(3)

    await admin.invoke({
      params: { resourceId: 'users', action: 'edit', recordId: '1' },
      method: 'post',
      payload: { name: 'A.' },
    })

    // orders entries are untouched.
    const remainingTags = [...cache.entries.values()].map((e) => e.tags.join(','))
    expect(remainingTags.sort()).toEqual(['list:orders'])
  })

  test('editing a referenced resource drops dependents (populated references)', async () => {
    const cache = new FakeCache()
    // orders.userId → users, so cached order lists/shows embed user data.
    const admin = buildAdmin(cache, [
      { name: 'users', rows: [{ id: '1', name: 'Ann' }] },
      {
        name: 'orders',
        rows: [{ id: 'o1', name: 'first', userId: '1' }],
        properties: [
          new BaseProperty({ path: 'id', isId: true, isSortable: true }),
          new BaseProperty({ path: 'name', type: 'string' }),
          new BaseProperty({ path: 'userId', type: 'string', reference: 'users' }),
        ],
      },
    ])
    await admin.invoke(listReq('orders'))
    await admin.invoke(showReq('orders', 'o1'))
    expect(cache.entries.size).toBe(2)

    await admin.invoke({
      params: { resourceId: 'users', action: 'edit', recordId: '1' },
      method: 'post',
      payload: { name: 'Annette' },
    })

    // Both order entries embedded the renamed user — they must be gone.
    expect(cache.entries.size).toBe(0)
    expect(cache.invalidations).toEqual([
      'list:users',
      'record:users:1',
      'list:orders',
      'records:orders',
    ])
  })

  test('editing a dependent resource does not drop the referenced one', async () => {
    const cache = new FakeCache()
    const admin = buildAdmin(cache, [
      { name: 'users', rows: [{ id: '1', name: 'Ann' }] },
      {
        name: 'orders',
        rows: [{ id: 'o1', name: 'first', userId: '1' }],
        properties: [
          new BaseProperty({ path: 'id', isId: true, isSortable: true }),
          new BaseProperty({ path: 'name', type: 'string' }),
          new BaseProperty({ path: 'userId', type: 'string', reference: 'users' }),
        ],
      },
    ])
    await admin.invoke(listReq('users'))

    await admin.invoke({
      params: { resourceId: 'orders', action: 'edit', recordId: 'o1' },
      method: 'post',
      payload: { name: 'renamed' },
    })

    // The user list embeds no order data — it survives.
    const remaining = [...cache.entries.values()].map((e) => e.tags.join(','))
    expect(remaining).toEqual(['list:users'])
  })

  test('custom action with invalidates: true drops its own resource caches', async () => {
    const cache = new FakeCache()
    const admin = new ModernAdmin({
      adapters: [adapter],
      cache,
      resources: [
        {
          resource: { name: 'users', rows: [{ id: '1', name: 'Ann' }] },
          options: {
            actions: {
              archive: {
                name: 'archive',
                actionType: 'record' as const,
                invalidates: true as const,
                handler: async () => ({ notice: { message: 'ok', type: 'success' as const } }),
              },
            },
          },
        },
      ],
    })
    await admin.invoke(listReq('users'))
    await admin.invoke(showReq('users', '1'))
    expect(cache.entries.size).toBe(2)

    await admin.invoke({
      params: { resourceId: 'users', action: 'archive', recordId: '1' },
      method: 'post',
    })

    expect(cache.entries.size).toBe(0)
    expect(cache.invalidations).toContain('list:users')
    expect(cache.invalidations).toContain('record:users:1')
  })

  test('custom action without invalidates leaves caches alone', async () => {
    const cache = new FakeCache()
    const admin = new ModernAdmin({
      adapters: [adapter],
      cache,
      resources: [
        {
          resource: { name: 'users', rows: [{ id: '1', name: 'Ann' }] },
          options: {
            actions: {
              stats: {
                name: 'stats',
                actionType: 'resource' as const,
                handler: async () => ({ notice: { message: 'ok', type: 'success' as const } }),
              },
            },
          },
        },
      ],
    })
    await admin.invoke(listReq('users'))
    expect(cache.entries.size).toBe(1)

    await admin.invoke({
      params: { resourceId: 'users', action: 'stats' },
      method: 'post',
    })

    expect(cache.entries.size).toBe(1)
    expect(cache.invalidations).toEqual([])
  })
})

describe('cross-instance invalidation (pub/sub)', () => {
  class PubSubFakeCache extends FakeCache {
    public published: Array<{ channel: string; message: string }> = []
    private handlers = new Map<string, Array<(message: string) => void>>()
    async publish(channel: string, message: string): Promise<void> {
      this.published.push({ channel, message })
    }
    async subscribe(
      channel: string,
      handler: (message: string) => void,
    ): Promise<() => void> {
      const bucket = this.handlers.get(channel) ?? []
      bucket.push(handler)
      this.handlers.set(channel, bucket)
      return () => {}
    }
    emit(channel: string, message: string): void {
      for (const handler of this.handlers.get(channel) ?? []) handler(message)
    }
  }

  test('invalidateTag broadcasts and remote messages invalidate locally', async () => {
    const cache = new PubSubFakeCache()
    const admin = buildAdmin(cache, [
      { name: 'users', rows: [{ id: '1', name: 'Ann' }] },
    ])

    // Local mutation → invalidation is published for sibling instances.
    await admin.invoke({
      params: { resourceId: 'users', action: 'edit', recordId: '1' },
      method: 'post',
      payload: { name: 'A.' },
    })
    expect(cache.published.length).toBe(1)
    const broadcast = JSON.parse(cache.published[0]!.message) as { src: string; tags: string[] }
    expect(broadcast.tags).toEqual(['list:users', 'record:users:1'])

    // Incoming message from another instance → local tags drop.
    await admin.invoke(listReq('users'))
    expect(cache.entries.size).toBe(1)
    cache.emit('cache:invalidate', JSON.stringify({ src: 'other-instance', tags: ['list:users'] }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(cache.entries.size).toBe(0)

    // Self-published messages are ignored (no double work / storms).
    const before = cache.invalidations.length
    cache.emit('cache:invalidate', cache.published[0]!.message)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(cache.invalidations.length).toBe(before)
  })
})
