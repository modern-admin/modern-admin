import { describe, expect, test } from 'bun:test'
import { RedisCacheProvider } from '../src/index.js'
import { FakeRedis } from './_helpers/fake-redis.js'

describe('RedisCacheProvider', () => {
  test('set stores JSON payload with default TTL', async () => {
    const client = new FakeRedis()
    const cache = new RedisCacheProvider({ client, defaultTtl: 60 })
    await cache.set('users:1', { id: 1, name: 'Ann' })
    expect(client.store.get('ma:users:1')).toBe(JSON.stringify({ id: 1, name: 'Ann' }))
    expect(client.ttls.get('ma:users:1')).toBe(60)
  })

  test('set without TTL omits the EX argument', async () => {
    const client = new FakeRedis()
    const cache = new RedisCacheProvider({ client })
    await cache.set('k', 'v')
    const setCall = client.calls.find((c) => c.method === 'set')
    expect(setCall?.args).toEqual(['ma:k', JSON.stringify('v')])
  })

  test('get parses stored JSON; returns null on miss or bad JSON', async () => {
    const client = new FakeRedis()
    const cache = new RedisCacheProvider({ client })
    await cache.set('a', { hello: 'world' })
    expect(await cache.get<{ hello: string }>('a')).toEqual({ hello: 'world' })
    expect(await cache.get('missing')).toBeNull()
    client.store.set('ma:bad', '{not-json')
    expect(await cache.get('bad')).toBeNull()
  })

  test('honours custom prefix on every key', async () => {
    const client = new FakeRedis()
    const cache = new RedisCacheProvider({ client, prefix: 'app:' })
    await cache.set('x', 1, { tags: ['users'] })
    expect(Array.from(client.store.keys())).toEqual(['app:x'])
    expect(client.sets.get('app:tag:users')).toEqual(new Set(['app:x']))
  })

  test('per-call TTL overrides default TTL', async () => {
    const client = new FakeRedis()
    const cache = new RedisCacheProvider({ client, defaultTtl: 10 })
    await cache.set('k', 'v', { ttl: 5 })
    expect(client.ttls.get('ma:k')).toBe(5)
  })

  test('tags are recorded as Redis SETs containing full keys', async () => {
    const client = new FakeRedis()
    const cache = new RedisCacheProvider({ client })
    await cache.set('users:1', {}, { tags: ['resource:users', 'record:users:1'] })
    expect(client.sets.get('ma:tag:resource:users')).toEqual(new Set(['ma:users:1']))
    expect(client.sets.get('ma:tag:record:users:1')).toEqual(new Set(['ma:users:1']))
  })

  test('invalidateTag drops every member of every named tag plus the tag set itself', async () => {
    const client = new FakeRedis()
    const cache = new RedisCacheProvider({ client })
    await cache.set('users:1', { id: 1 }, { tags: ['resource:users'] })
    await cache.set('users:2', { id: 2 }, { tags: ['resource:users'] })
    await cache.invalidateTag('resource:users')
    expect(client.store.has('ma:users:1')).toBe(false)
    expect(client.store.has('ma:users:2')).toBe(false)
    expect(client.sets.has('ma:tag:resource:users')).toBe(false)
  })

  test('invalidateTag accepts multiple tags', async () => {
    const client = new FakeRedis()
    const cache = new RedisCacheProvider({ client })
    await cache.set('a', 1, { tags: ['t1'] })
    await cache.set('b', 2, { tags: ['t2'] })
    await cache.invalidateTag(['t1', 't2'])
    expect(client.store.size).toBe(0)
  })

  test('invalidateTag does not blow up when nothing matches', async () => {
    const client = new FakeRedis()
    const cache = new RedisCacheProvider({ client })
    await cache.set('untagged', 1)
    await cache.invalidateTag('unknown')
    expect(client.store.has('ma:untagged')).toBe(true)
  })

  test('del removes a single prefixed key', async () => {
    const client = new FakeRedis()
    const cache = new RedisCacheProvider({ client })
    await cache.set('k', 1)
    await cache.del('k')
    expect(client.store.has('ma:k')).toBe(false)
  })

  test('del accepts an array', async () => {
    const client = new FakeRedis()
    const cache = new RedisCacheProvider({ client })
    await cache.set('a', 1)
    await cache.set('b', 2)
    await cache.del(['a', 'b'])
    expect(client.store.size).toBe(0)
  })

  test('publish prefixes the channel and forwards the message', async () => {
    const client = new FakeRedis()
    const cache = new RedisCacheProvider({ client })
    await cache.publish('updates', 'hi')
    const publishCall = client.calls.find((c) => c.method === 'publish')
    expect(publishCall?.args).toEqual(['ma:updates', 'hi'])
  })

  test('subscribe wires a handler that fires on matching channel publishes', async () => {
    const client = new FakeRedis()
    const cache = new RedisCacheProvider({ client })
    const received: string[] = []
    const off = await cache.subscribe('updates', (msg) => {
      received.push(msg)
    })
    await cache.publish('updates', 'first')
    await cache.publish('updates', 'second')
    expect(received).toEqual(['first', 'second'])
    await off()
  })

  test('subscribe uses the provided dedicated subscriber when present', async () => {
    const client = new FakeRedis()
    const subscriber = new FakeRedis()
    // Wire publish on the primary client to the subscriber's channel registry
    // so we can prove the subscriber is the one receiving.
    subscriber.channels = client.channels
    const cache = new RedisCacheProvider({ client, subscriber })
    const received: string[] = []
    await cache.subscribe('events', (msg) => {
      received.push(msg)
    })
    await cache.publish('events', 'ping')
    expect(received).toEqual(['ping'])
    expect(subscriber.calls.some((c) => c.method === 'subscribe')).toBe(true)
    expect(client.calls.some((c) => c.method === 'subscribe')).toBe(false)
  })

  test('subscribe throws when no subscriber capability is available', async () => {
    const minimal = {
      get: async () => null,
      set: async () => 'OK',
      del: async () => 0,
      sadd: async () => 0,
      smembers: async () => [],
    }
    const cache = new RedisCacheProvider({ client: minimal })
    await expect(cache.subscribe('x', () => {})).rejects.toThrow(/cannot subscribe/)
  })
})
