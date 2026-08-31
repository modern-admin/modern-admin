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
    expect(client.store.get('ma:k')).toBe(JSON.stringify('v'))
    expect(client.ttls.has('ma:k')).toBe(false)
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

  test('persistent values keep their tag and reverse indexes persistent', async () => {
    const client = new FakeRedis()
    const cache = new RedisCacheProvider({ client })
    await cache.set('k', 1, { tags: ['t'] })
    expect(client.ttls.has('ma:k')).toBe(false)
    expect(client.ttls.has('ma:tag:t')).toBe(false)
    expect(client.ttls.has('ma:key-tags:ma:k')).toBe(false)
  })

  test('tag TTL only grows when entries use different TTLs', async () => {
    const client = new FakeRedis()
    const cache = new RedisCacheProvider({ client, tagTtl: 1 })
    await cache.set('long', 1, { ttl: 20, tags: ['t'] })
    await cache.set('short', 2, { ttl: 5, tags: ['t'] })
    expect(client.ttls.get('ma:tag:t')).toBe(20)
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
    expect(Array.from(client.store.keys()).filter((key) => !key.includes('tag-epoch:'))).toEqual([])
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

  test('tagged set is one atomic script and creates a reverse index', async () => {
    const client = new FakeRedis()
    const cache = new RedisCacheProvider({ client })
    await cache.set('k', 1, { tags: ['a', 'b'] })
    const evalCalls = client.calls.filter((call) => call.method === 'eval')
    expect(evalCalls).toHaveLength(1)
    expect(String(evalCalls[0]?.args[0])).toContain('MA_CACHE_SET_V2')
    expect(client.sets.get('ma:key-tags:ma:k')).toEqual(new Set(['ma:tag:a', 'ma:tag:b']))
  })

  test('overwriting a key removes memberships from old tags', async () => {
    const client = new FakeRedis()
    const cache = new RedisCacheProvider({ client })
    await cache.set('k', 1, { tags: ['old'] })
    await cache.set('k', 2, { tags: ['new'] })
    await cache.invalidateTag('old')
    expect(await cache.get<number>('k')).toBe(2)
    await cache.invalidateTag('new')
    expect(await cache.get('k')).toBeNull()
  })

  test('conditional set rejects an epoch changed by invalidation', async () => {
    const client = new FakeRedis()
    const cache = new RedisCacheProvider({ client })
    const before = await cache.getTagEpochs(['list:users'])
    await cache.invalidateTag('list:users')
    expect(
      await cache.setIfTagEpochsMatch('k', { stale: true }, before, { tags: ['list:users'] }),
    ).toBe(false)
    expect(await cache.get('k')).toBeNull()
  })

  test('distributed lock release is token protected', async () => {
    const client = new FakeRedis()
    const cache = new RedisCacheProvider({ client })
    expect(await cache.acquireLock('k', 'owner', 1_000)).toBe(true)
    expect(await cache.acquireLock('k', 'other', 1_000)).toBe(false)
    await cache.releaseLock('k', 'other')
    expect(await cache.acquireLock('k', 'third', 1_000)).toBe(false)
    await cache.releaseLock('k', 'owner')
    expect(await cache.acquireLock('k', 'third', 1_000)).toBe(true)
  })

  test('del accepts an array', async () => {
    const client = new FakeRedis()
    const cache = new RedisCacheProvider({ client })
    await cache.set('a', 1)
    await cache.set('b', 2)
    await cache.del(['a', 'b'])
    expect(client.store.size).toBe(0)
  })

  test('round-trips BigInt without crashing JSON.stringify', async () => {
    const client = new FakeRedis()
    const cache = new RedisCacheProvider({ client })
    // Prisma returns `BigInt` columns as native bigint — list responses
    // carrying them used to crash cache.set with "TypeError: JSON.stringify
    // cannot serialize BigInt". The sentinel-based replacer/reviver must
    // preserve both the type and the value.
    const payload = { id: 1n, nested: { huge: 9007199254740993n } }
    await cache.set('rec', payload)
    expect(client.store.get('ma:rec')).toBe(
      '{"id":{"__bigint":"1"},"nested":{"huge":{"__bigint":"9007199254740993"}}}',
    )
    expect(await cache.get<typeof payload>('rec')).toEqual(payload)
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
