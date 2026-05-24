import { describe, expect, test } from 'bun:test'
import { CacheRuntime, listTag, recordTag } from '../src/actions/cache-runtime.js'
import type { CacheSetOptions, ICacheProvider } from '../src/ports/cache-provider.js'

interface Entry { value: unknown; tags: string[] }

/** Minimal in-memory provider with tag invalidation. */
class FakeCache implements ICacheProvider {
  public readonly entries = new Map<string, Entry>()
  public readonly tags = new Map<string, Set<string>>()
  public getCalls = 0
  public setCalls = 0

  async get<T>(key: string): Promise<T | null> {
    this.getCalls++
    const row = this.entries.get(key)
    return row ? (row.value as T) : null
  }
  async set<T>(key: string, value: T, options: CacheSetOptions = {}): Promise<void> {
    this.setCalls++
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
      const bucket = this.tags.get(t)
      if (!bucket) continue
      for (const key of bucket) this.entries.delete(key)
      this.tags.delete(t)
    }
  }
}

describe('CacheRuntime.read', () => {
  test('returns cached value when present (read-through hit)', async () => {
    const cache = new FakeCache()
    await cache.set('k', { v: 1 }, { tags: ['t'] })
    const rt = new CacheRuntime(cache)
    let fetched = 0
    const result = await rt.read('k', { enabled: true, ttl: 60 }, async () => {
      fetched++
      return { v: 2 }
    })
    expect(result).toEqual({ v: 1 })
    expect(fetched).toBe(0)
  })

  test('runs fetch on miss and stores with ttl/tags', async () => {
    const cache = new FakeCache()
    const rt = new CacheRuntime(cache)
    const result = await rt.read(
      'k',
      { enabled: true, ttl: 60, tags: ['list:users'] },
      async () => ({ v: 42 }),
    )
    expect(result).toEqual({ v: 42 })
    expect(cache.entries.get('k')?.value).toEqual({ v: 42 })
    expect(cache.entries.get('k')?.tags).toEqual(['list:users'])
  })

  test('with enabled=false bypasses both get and set', async () => {
    const cache = new FakeCache()
    const rt = new CacheRuntime(cache)
    let fetched = 0
    const result = await rt.read('k', { enabled: false, ttl: 60 }, async () => {
      fetched++
      return { v: 7 }
    })
    expect(result).toEqual({ v: 7 })
    expect(fetched).toBe(1)
    expect(cache.getCalls).toBe(0)
    expect(cache.setCalls).toBe(0)
    expect(cache.entries.size).toBe(0)
  })

  test('coalesces concurrent misses into a single fetch (in-flight dedup)', async () => {
    const cache = new FakeCache()
    const rt = new CacheRuntime(cache)
    let inFlight = 0
    let maxInFlight = 0
    const fetch = async () => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((r) => setTimeout(r, 20))
      inFlight--
      return { v: 'shared' }
    }
    const [a, b, c] = await Promise.all([
      rt.read('k', { enabled: true, ttl: 60 }, fetch),
      rt.read('k', { enabled: true, ttl: 60 }, fetch),
      rt.read('k', { enabled: true, ttl: 60 }, fetch),
    ])
    expect(a).toEqual({ v: 'shared' })
    expect(b).toEqual(a)
    expect(c).toEqual(a)
    expect(maxInFlight).toBe(1)
    // set was called exactly once for the shared key.
    expect(cache.setCalls).toBe(1)
  })

  test('dedup also applies when cache is disabled (coalesce-only mode)', async () => {
    const cache = new FakeCache()
    const rt = new CacheRuntime(cache)
    let calls = 0
    const fetch = async () => {
      calls++
      await new Promise((r) => setTimeout(r, 10))
      return calls
    }
    const [a, b] = await Promise.all([
      rt.read('k', { enabled: false, ttl: 60 }, fetch),
      rt.read('k', { enabled: false, ttl: 60 }, fetch),
    ])
    expect(a).toBe(1)
    expect(b).toBe(1)
    expect(calls).toBe(1)
  })

  test('failed fetch is not cached and does not poison the in-flight slot', async () => {
    const cache = new FakeCache()
    const rt = new CacheRuntime(cache)
    let attempt = 0
    const fetch = async () => {
      attempt++
      if (attempt === 1) throw new Error('boom')
      return { v: 'ok' }
    }
    await expect(
      rt.read('k', { enabled: true, ttl: 60 }, fetch),
    ).rejects.toThrow('boom')
    expect(cache.setCalls).toBe(0)
    expect(rt.inFlightSize).toBe(0)
    // Second call runs the fetch again and succeeds.
    const result = await rt.read('k', { enabled: true, ttl: 60 }, fetch)
    expect(result).toEqual({ v: 'ok' })
  })

  test('invalidateTags forwards to the provider', async () => {
    const cache = new FakeCache()
    await cache.set('a', 1, { tags: ['list:users'] })
    await cache.set('b', 2, { tags: ['list:users'] })
    await cache.set('c', 3, { tags: ['record:users:1'] })
    const rt = new CacheRuntime(cache)
    await rt.invalidateTags('list:users')
    expect(cache.entries.has('a')).toBe(false)
    expect(cache.entries.has('b')).toBe(false)
    expect(cache.entries.has('c')).toBe(true)
  })
})

describe('tag helpers', () => {
  test('listTag is per-resource', () => {
    expect(listTag('users')).toBe('list:users')
    expect(listTag('orders')).toBe('list:orders')
  })
  test('recordTag is per-resource per-record', () => {
    expect(recordTag('users', '1')).toBe('record:users:1')
    expect(recordTag('users', '2')).toBe('record:users:2')
  })
})
