import { describe, expect, test } from 'bun:test'
import { MemoryCacheProvider } from '../src/ports/cache-provider.js'

describe('MemoryCacheProvider', () => {
  test('removes old tag membership when overwriting a key', async () => {
    const cache = new MemoryCacheProvider()
    await cache.set('k', 1, { tags: ['old'] })
    await cache.set('k', 2, { tags: ['new'] })
    await cache.invalidateTag('old')
    expect(await cache.get<number>('k')).toBe(2)
    await cache.invalidateTag('new')
    expect(await cache.get('k')).toBeNull()
  })

  test('del and TTL expiry clean tag membership', async () => {
    const cache = new MemoryCacheProvider()
    await cache.set('deleted', 1, { tags: ['t'] })
    await cache.del('deleted')
    const realNow = Date.now
    let now = 1_000
    Date.now = () => now
    try {
      await cache.set('expired', 2, { ttl: 1, tags: ['t'] })
      now += 1_001
      expect(await cache.get('expired')).toBeNull()
      await cache.invalidateTag('t')
      expect(await cache.get('deleted')).toBeNull()
    } finally {
      Date.now = realNow
    }
  })

  test('non-positive TTL stays persistent, matching Redis semantics', async () => {
    const cache = new MemoryCacheProvider()
    await cache.set('k', 1, { ttl: 0 })
    expect(await cache.get<number>('k')).toBe(1)
  })

  test('evicts the least recently used entry at maxEntries', async () => {
    const cache = new MemoryCacheProvider({ maxEntries: 2 })
    await cache.set('a', 1)
    await cache.set('b', 2)
    await cache.get('a')
    await cache.set('c', 3)
    expect(await cache.get<number>('a')).toBe(1)
    expect(await cache.get('b')).toBeNull()
    expect(await cache.get<number>('c')).toBe(3)
  })
})
