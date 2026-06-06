// Tag invalidation contract across built-in read and mutation actions.
//
// Verifies that:
//   * list / search responses are tagged ONLY with `list:<resourceId>`
//   * show responses are tagged ONLY with `record:<resourceId>:<recordId>`
//   * mutations invalidate the right tags and leave unrelated entries alone
//
// In particular: editing record A should NOT drop the cached show of
// record B, and creating a new row should NOT drop any show cache.

import { describe, expect, test } from 'bun:test'
import { ModernAdmin } from '../src/modern-admin.js'
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

  test('show response is tagged only with record:<resourceId>:<recordId>', async () => {
    const cache = new FakeCache()
    const admin = buildAdmin(cache, [
      { name: 'users', rows: [{ id: '1', name: 'Ann' }] },
    ])
    await admin.invoke<RecordActionResponse>(showReq('users', '1'))
    expect(cache.entries.size).toBe(1)
    const entry = [...cache.entries.values()][0]!
    expect(entry.tags).toEqual(['record:users:1'])
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

    await admin.invoke({
      params: { resourceId: 'users', action: 'new' },
      method: 'post',
      payload: { name: 'Bob' },
    })

    expect(cache.invalidations).toEqual(['list:users'])
    // Show entry survives the insert; list entry is gone.
    const remaining = [...cache.entries.values()].map((e) => e.tags.join(','))
    expect(remaining).toEqual(['record:users:1'])
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
    expect(remaining).toEqual(['record:users:2'])
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
    expect(remaining).toEqual(['record:users:2'])
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
    expect(remaining).toEqual(['record:users:3'])
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
})
