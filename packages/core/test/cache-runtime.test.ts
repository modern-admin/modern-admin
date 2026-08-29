import { describe, expect, test } from 'bun:test'
import { CacheRuntime, listTag, recordTag } from '../src/actions/cache-runtime.js'
import type { CacheSetOptions, ICacheProvider } from '../src/ports/cache-provider.js'

interface Entry {
  value: unknown
  tags: string[]
}

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

  test('opt-in lock coalesces a miss across runtime instances', async () => {
    class LockingCache extends FakeCache {
      private lockToken: string | null = null
      async acquireLock(_key: string, token: string): Promise<boolean> {
        if (this.lockToken) return false
        this.lockToken = token
        return true
      }
      async releaseLock(_key: string, token: string): Promise<void> {
        if (this.lockToken === token) this.lockToken = null
      }
    }
    const cache = new LockingCache()
    const firstRuntime = new CacheRuntime(cache, { metricsLogIntervalMs: 0 })
    const secondRuntime = new CacheRuntime(cache, { metricsLogIntervalMs: 0 })
    let computes = 0
    const fetch = async () => {
      computes++
      await new Promise((resolve) => setTimeout(resolve, 5))
      return { value: 1 }
    }
    const options = {
      enabled: true,
      ttl: 60,
      tags: ['list:users'],
      crossReplicaLock: true,
      lockWaitMs: 20,
    }
    const [first, second] = await Promise.all([
      firstRuntime.read('k', options, fetch),
      secondRuntime.read('k', options, fetch),
    ])
    expect(first).toEqual({ value: 1 })
    expect(second).toEqual(first)
    expect(computes).toBe(1)
    expect(secondRuntime.stats().entries[0]?.lockWaits).toBe(1)
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
    await expect(rt.read('k', { enabled: true, ttl: 60 }, fetch)).rejects.toThrow('boom')
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

  test('does not write a computation that started before tag invalidation', async () => {
    const cache = new FakeCache()
    const rt = new CacheRuntime(cache)
    let release!: (value: { v: string }) => void
    const fetch = new Promise<{ v: string }>((resolve) => {
      release = resolve
    })
    const pending = rt.read('k', { enabled: true, ttl: 60, tags: ['list:users'] }, () => fetch)
    await new Promise((resolve) => setTimeout(resolve, 0))
    await rt.invalidateTags('list:users')
    release({ v: 'stale' })
    await expect(pending).resolves.toEqual({ v: 'stale' })
    expect(cache.entries.has('k')).toBe(false)
  })

  test('does not join an in-flight computation from an older tag generation', async () => {
    const cache = new FakeCache()
    const rt = new CacheRuntime(cache)
    const releases: Array<(value: number) => void> = []
    let calls = 0
    const fetch = () => {
      calls++
      return new Promise<number>((resolve) => releases.push(resolve))
    }
    const oldRead = rt.read('k', { enabled: true, ttl: 60, tags: ['list:users'] }, fetch)
    await new Promise((resolve) => setTimeout(resolve, 0))
    await rt.invalidateTags('list:users')
    const newRead = rt.read('k', { enabled: true, ttl: 60, tags: ['list:users'] }, fetch)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(calls).toBe(2)
    releases[1]!(2)
    releases[0]!(1)
    await expect(newRead).resolves.toBe(2)
    await expect(oldRead).resolves.toBe(1)
    expect(cache.entries.get('k')?.value).toBe(2)
  })

  test('cache read and write failures degrade to a computed response', async () => {
    class BrokenCache extends FakeCache {
      override async get<T>(): Promise<T | null> {
        throw new Error('redis down')
      }
      override async set(): Promise<void> {
        throw new Error('redis down')
      }
    }
    const rt = new CacheRuntime(new BrokenCache())
    await expect(
      rt.read('k', { enabled: true, ttl: 60, tags: ['list:users'] }, async () => ({ ok: true })),
    ).resolves.toEqual({ ok: true })
    expect(rt.stats().entries[0]?.readErrors).toBe(1)
  })

  test('failed invalidation quarantines tags and bypasses subsequent reads', async () => {
    class FailingInvalidationCache extends FakeCache {
      override async invalidateTag(): Promise<void> {
        throw new Error('redis down')
      }
    }
    const cache = new FailingInvalidationCache()
    const rt = new CacheRuntime(cache, {
      invalidationAttempts: 1,
      quarantineRetryMs: 60_000,
    })
    await rt.invalidateTags('list:users')
    const readsBefore = cache.getCalls
    await rt.read('k', { enabled: true, ttl: 60, tags: ['list:users'] }, async () => ({
      fresh: true,
    }))
    expect(cache.getCalls).toBe(readsBefore)
    expect(cache.entries.has('k')).toBe(false)
    expect(rt.stats().dirtyTags).toEqual(['list:users'])
    await rt.dispose()
  })
})

// Forced revalidation — what the list view's refresh button triggers.
// The contract: never serve the cached entry, always hit the source, and
// when the source disagrees with the cache, drop the resource's scopes
// (the caller's `onChanged`) *before* storing the fresh value.
describe('CacheRuntime.read — refresh', () => {
  const opts = (extra: Record<string, unknown> = {}) => ({
    enabled: true,
    ttl: 60,
    tags: ['list:users'],
    refresh: true,
    ...extra,
  })

  test('ignores the cached entry and returns freshly fetched data', async () => {
    const cache = new FakeCache()
    await cache.set('k', { v: 'stale' }, { tags: ['list:users'] })
    const rt = new CacheRuntime(cache)
    let fetched = 0
    const result = await rt.read('k', opts(), async () => {
      fetched++
      return { v: 'fresh' }
    })
    expect(result).toEqual({ v: 'fresh' })
    expect(fetched).toBe(1)
    expect(cache.entries.get('k')?.value).toEqual({ v: 'fresh' })
  })

  test('unchanged data does not fire onChanged but refreshes the entry', async () => {
    const cache = new FakeCache()
    await cache.set('k', { records: [{ id: '1' }] }, { tags: ['list:users'] })
    const rt = new CacheRuntime(cache)
    let changed = 0
    const result = await rt.read(
      'k',
      opts({
        onChanged: () => {
          changed++
        },
      }),
      async () => ({ records: [{ id: '1' }] }),
    )
    expect(result).toEqual({ records: [{ id: '1' }] })
    expect(changed).toBe(0)
    expect(cache.setCalls).toBe(2) // the seed above + the write-back
  })

  test('changed data fires onChanged before storing, so the fresh entry survives', async () => {
    const cache = new FakeCache()
    await cache.set('k', { records: [{ id: '1' }] }, { tags: ['list:users'] })
    await cache.set('other-page', { records: [] }, { tags: ['list:users'] })
    const rt = new CacheRuntime(cache)

    const result = await rt.read(
      'k',
      opts({ onChanged: () => rt.invalidateTags('list:users') }),
      async () => ({ records: [{ id: '1' }, { id: '2' }] }),
    )

    expect(result).toEqual({ records: [{ id: '1' }, { id: '2' }] })
    // Every other cached scope of the resource was dropped…
    expect(cache.entries.has('other-page')).toBe(false)
    // …while the value we just fetched stayed cached.
    expect(cache.entries.get('k')?.value).toEqual({ records: [{ id: '1' }, { id: '2' }] })
  })

  test('a JSON round-trip of the same data is not a change', async () => {
    // Redis hands back ISO strings where a fresh fetch carries Dates.
    const cache = new FakeCache()
    const at = new Date('2026-01-01T00:00:00.000Z')
    await cache.set('k', JSON.parse(JSON.stringify({ createdAt: at, n: 1 })), {
      tags: ['list:users'],
    })
    const rt = new CacheRuntime(cache)
    let changed = 0
    await rt.read(
      'k',
      opts({
        onChanged: () => {
          changed++
        },
      }),
      async () => ({ createdAt: at, n: 1 }),
    )
    expect(changed).toBe(0)
  })

  test('cold key just fetches and stores — nothing to compare against', async () => {
    const cache = new FakeCache()
    const rt = new CacheRuntime(cache)
    let changed = 0
    const result = await rt.read(
      'k',
      opts({
        onChanged: () => {
          changed++
        },
      }),
      async () => ({ v: 1 }),
    )
    expect(result).toEqual({ v: 1 })
    expect(changed).toBe(0)
    expect(cache.entries.get('k')?.value).toEqual({ v: 1 })
  })

  test('with caching disabled it is a plain pass-through fetch', async () => {
    const cache = new FakeCache()
    const rt = new CacheRuntime(cache)
    let changed = 0
    const result = await rt.read(
      'k',
      opts({
        enabled: false,
        onChanged: () => {
          changed++
        },
      }),
      async () => ({ v: 1 }),
    )
    expect(result).toEqual({ v: 1 })
    expect(changed).toBe(0)
    expect(cache.getCalls).toBe(0)
    expect(cache.setCalls).toBe(0)
  })

  test('does not join an in-flight read — a refresh must reach the source', async () => {
    const cache = new FakeCache()
    const rt = new CacheRuntime(cache)
    let calls = 0
    const fetch = async () => {
      const call = ++calls
      await new Promise((r) => setTimeout(r, 10))
      return { call }
    }
    const [normal, refreshed] = await Promise.all([
      rt.read('k', { enabled: true, ttl: 60 }, fetch),
      rt.read('k', opts(), fetch),
    ])
    expect(calls).toBe(2)
    expect(normal).not.toEqual(refreshed)
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
