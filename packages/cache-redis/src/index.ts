// @modern-admin/cache-redis — ICacheProvider implementation backed by an
// ioredis (or compatible) client. Tag invalidation is implemented via Redis
// SETs that map a tag to the keys it covers, plus a reverse key-to-tags index.
// Both value writes and tag registration happen in one Lua script; mutating a
// record raises every tag epoch and drains the index atomically.
//
// This closes both interleavings: SADD during SMEMBERS→DEL and SET before an
// invalidation followed by SADD after it. Conditional writes compare Redis
// tag epochs in the same script, fencing computations started before a
// cross-instance invalidation. Tag SETs carry a sliding expiry, and explicit
// deletes/overwrites remove reverse memberships.

import { createRequire } from 'node:module'
import {
  ConsoleLogger,
  type CacheSetOptions,
  type CacheTagEpochs,
  type ICacheProvider,
  type ILogger,
} from '@modern-admin/core'

const require_ = createRequire(import.meta.url)

// Structurally compatible with `ioredis.Redis` (and node-redis-style clients).
// `set`/`sadd`/`del`/`publish` value types are widened to `string | number | Buffer`
// and `set` is exposed as two overloads (with and without TTL) so the real
// ioredis client — which has a dozen overloads on the same method — assigns
// without requiring `as unknown as RedisLike` at the call site.
export interface RedisLike {
  get(key: string): Promise<string | null>
  set(key: string, value: string | number | Buffer): Promise<unknown>
  set(
    key: string,
    value: string | number | Buffer,
    mode: 'EX',
    ttl: number | string,
  ): Promise<unknown>
  set(
    key: string,
    value: string | number | Buffer,
    mode: 'PX',
    ttl: number | string,
    condition: 'NX',
  ): Promise<unknown>
  del(...keys: string[]): Promise<unknown>
  sadd(key: string, ...values: (string | number | Buffer)[]): Promise<unknown>
  smembers(key: string): Promise<string[]>
  srem?(key: string, ...values: (string | number | Buffer)[]): Promise<unknown>
  expire?(key: string, seconds: number | string): Promise<unknown>
  eval?(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>
  publish?(channel: string, message: string | Buffer): Promise<unknown>
  duplicate?(): RedisLike
  subscribe?(channel: string): Promise<unknown>
  on?(event: 'message', handler: (channel: string, message: string) => void): unknown
}

export interface RedisCacheOptions {
  client: RedisLike
  /** Prefix prepended to every key/tag. Defaults to "ma:". */
  prefix?: string
  /** Default TTL in seconds when none is provided to `set()`. */
  defaultTtl?: number
  /**
   * TTL floor (seconds) applied to tag SETs for expiring values so abandoned tags cannot
   * grow unbounded. Refreshed on each `set()` that references the tag, and
   * always at least as long as the covered entry's own TTL. Must exceed the
   * longest-lived cache entry it covers, or a tag could expire while a member
   * is still cached (leaving that member un-invalidatable). Defaults to 30
   * days. Pass `0` to opt out and keep tag SETs persistent.
   */
  tagTtl?: number
  /** Optional dedicated subscriber client (ioredis requires it). */
  subscriber?: RedisLike
  logger?: ILogger
}

const TAG_PREFIX = 'tag:'
const TAG_EPOCH_PREFIX = 'tag-epoch:'
const KEY_TAGS_PREFIX = 'key-tags:'
const LOCK_PREFIX = 'lock:'

// Default TTL floor for tag SETs — 30 days. Comfortably longer than any
// realistic cache-entry TTL, so tags outlive their members while still
// self-expiring once a resource stops being written.
const DEFAULT_TAG_TTL = 60 * 60 * 24 * 30

// Atomic tag invalidation. For each tag SET passed in KEYS, delete every key
// it references and then the SET itself, all within one script so a
// concurrent `set()` cannot interleave a fresh member between the read and
// the delete. Returns the number of cache keys removed.
const INVALIDATE_TAG_SCRIPT = `
-- MA_CACHE_INVALIDATE_V2
local removed = 0
local reversePrefix = ARGV[1]
for i = 1, #KEYS, 2 do
  redis.call('INCR', KEYS[i + 1])
end
for i = 1, #KEYS, 2 do
  local members = redis.call('SMEMBERS', KEYS[i])
  for j = 1, #members do
    local reverseKey = reversePrefix .. members[j]
    local memberTags = redis.call('SMEMBERS', reverseKey)
    for k = 1, #memberTags do
      redis.call('SREM', memberTags[k], members[j])
    end
    removed = removed + redis.call('DEL', members[j])
    redis.call('DEL', reverseKey)
  end
  redis.call('DEL', KEYS[i])
end
return removed
`

const SET_WITH_TAGS_SCRIPT = `
-- MA_CACHE_SET_V2
local tagCount = tonumber(ARGV[1])
local payload = ARGV[2]
local valueTtlMs = tonumber(ARGV[3])
local tagTtlMs = tonumber(ARGV[4])
local conditional = ARGV[5] == '1'

if conditional then
  for i = 1, tagCount do
    local current = redis.call('GET', KEYS[2 + tagCount + i]) or '0'
    if current ~= ARGV[5 + i] then return 0 end
  end
end

local oldTags = redis.call('SMEMBERS', KEYS[2])
for i = 1, #oldTags do
  redis.call('SREM', oldTags[i], KEYS[1])
end
redis.call('DEL', KEYS[2])

if valueTtlMs > 0 then
  redis.call('SET', KEYS[1], payload, 'PX', valueTtlMs)
else
  redis.call('SET', KEYS[1], payload)
end

for i = 1, tagCount do
  local tagKey = KEYS[2 + i]
  redis.call('SADD', tagKey, KEYS[1])
  redis.call('SADD', KEYS[2], tagKey)
  if tagTtlMs > 0 then
    redis.call('PEXPIRE', tagKey, tagTtlMs, 'NX')
    redis.call('PEXPIRE', tagKey, tagTtlMs, 'GT')
  end
end
if tagCount > 0 and valueTtlMs > 0 then
  redis.call('PEXPIRE', KEYS[2], valueTtlMs)
end
return 1
`

const DELETE_WITH_TAGS_SCRIPT = `
-- MA_CACHE_DELETE_V2
for i = 1, #KEYS, 2 do
  local memberTags = redis.call('SMEMBERS', KEYS[i + 1])
  for j = 1, #memberTags do
    redis.call('SREM', memberTags[j], KEYS[i])
  end
  redis.call('DEL', KEYS[i])
  redis.call('DEL', KEYS[i + 1])
end
return 1
`

const RELEASE_LOCK_SCRIPT = `
-- MA_CACHE_RELEASE_LOCK_V1
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`

// Sentinel used to round-trip BigInt values through JSON without losing
// the JS type. `BaseRecord.toJSON()` already strings BigInts for the wire,
// so in practice we rarely hit this — but callers (custom action handlers,
// adapter authors) sometimes hand BigInt-bearing payloads straight to the
// cache, and we don't want that to crash the request.
const BIGINT_TAG = '__bigint'
const stringifyReplacer = (_key: string, value: unknown): unknown =>
  typeof value === 'bigint' ? { [BIGINT_TAG]: value.toString() } : value
const parseReviver = (_key: string, value: unknown): unknown => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj)
    if (keys.length === 1 && keys[0] === BIGINT_TAG && typeof obj[BIGINT_TAG] === 'string') {
      return BigInt(obj[BIGINT_TAG] as string)
    }
  }
  return value
}

export class RedisCacheProvider implements ICacheProvider {
  private readonly client: RedisLike
  private readonly subscriber: RedisLike | undefined
  private readonly prefix: string
  private readonly defaultTtl: number | undefined
  private readonly tagTtl: number
  private readonly logger: ILogger

  constructor(opts: RedisCacheOptions) {
    this.client = opts.client
    this.prefix = opts.prefix ?? 'ma:'
    if (opts.defaultTtl !== undefined) this.defaultTtl = opts.defaultTtl
    this.tagTtl = opts.tagTtl ?? DEFAULT_TAG_TTL
    this.subscriber = opts.subscriber
    this.logger = opts.logger ?? new ConsoleLogger()
  }

  private k(key: string): string {
    return `${this.prefix}${key}`
  }

  private tagKey(tag: string): string {
    return this.k(`${TAG_PREFIX}${tag}`)
  }

  private tagEpochKey(tag: string): string {
    return this.k(`${TAG_EPOCH_PREFIX}${tag}`)
  }

  private reverseKey(fullKey: string): string {
    return this.k(`${KEY_TAGS_PREFIX}${fullKey}`)
  }

  private lockKey(key: string): string {
    return this.k(`${LOCK_PREFIX}${key}`)
  }

  private ttlWithJitter(options: CacheSetOptions): number | undefined {
    const base = options.ttl ?? this.defaultTtl
    if (base == null || base <= 0) return base
    const ratio = Math.max(0, options.jitterRatio ?? 0)
    return base + Math.floor(Math.random() * ratio * base)
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const raw = await this.client.get(this.k(key))
    if (raw == null) return null
    try {
      return JSON.parse(raw, parseReviver) as T
    } catch {
      return null
    }
  }

  async set<T = unknown>(key: string, value: T, options: CacheSetOptions = {}): Promise<void> {
    await this.store(key, value, options)
  }

  private async store<T = unknown>(
    key: string,
    value: T,
    options: CacheSetOptions,
    expectedTagEpochs?: CacheTagEpochs,
  ): Promise<boolean> {
    const ttl = this.ttlWithJitter(options)
    const fullKey = this.k(key)
    const payload = JSON.stringify(value, stringifyReplacer)
    const tags = Array.from(new Set(options.tags ?? [])).sort()
    const tagKeys = tags.map((tag) => this.tagKey(tag))
    const epochKeys = tags.map((tag) => this.tagEpochKey(tag))
    const reverseKey = this.reverseKey(fullKey)
    const valueTtlMs = ttl != null && ttl > 0 ? ttl * 1000 : 0
    // A persistent value needs a persistent tag/reverse index; expiring the
    // tag first would strand a value that no later invalidation could find.
    const tagExpiryMs = valueTtlMs > 0 ? Math.max(ttl ?? 0, this.tagTtl) * 1000 : 0
    if (this.client.eval) {
      const result = await this.client.eval(
        SET_WITH_TAGS_SCRIPT,
        2 + tagKeys.length + epochKeys.length,
        fullKey,
        reverseKey,
        ...tagKeys,
        ...epochKeys,
        tags.length,
        payload,
        valueTtlMs,
        tagExpiryMs,
        expectedTagEpochs ? 1 : 0,
        ...tags.map((tag) => expectedTagEpochs?.[tag] ?? '0'),
      )
      return Number(result) === 1
    }
    this.logger.warn('[modern-admin] Redis client has no EVAL; cache writes are not atomic')
    if (expectedTagEpochs) {
      const current = await this.getTagEpochs(tags)
      if (tags.some((tag) => current[tag] !== (expectedTagEpochs[tag] ?? '0'))) return false
    }
    const oldTags = await this.client.smembers(reverseKey)
    await Promise.all(oldTags.map((tagKey) => this.client.srem?.(tagKey, fullKey)))
    await this.client.del(reverseKey)
    if (ttl != null && ttl > 0) await this.client.set(fullKey, payload, 'EX', ttl)
    else await this.client.set(fullKey, payload)
    for (const tagKey of tagKeys) {
      await this.client.sadd(tagKey, fullKey)
      await this.client.sadd(reverseKey, tagKey)
      if (tagExpiryMs > 0) await this.client.expire?.(tagKey, Math.ceil(tagExpiryMs / 1000))
    }
    if (valueTtlMs > 0) await this.client.expire?.(reverseKey, Math.ceil(valueTtlMs / 1000))
    return true
  }

  async getTagEpochs(tags: string[]): Promise<CacheTagEpochs> {
    const pairs = await Promise.all(
      tags.map(
        async (tag) => [tag, (await this.client.get(this.tagEpochKey(tag))) ?? '0'] as const,
      ),
    )
    return Object.fromEntries(pairs)
  }

  async setIfTagEpochsMatch<T = unknown>(
    key: string,
    value: T,
    expectedTagEpochs: CacheTagEpochs,
    options: CacheSetOptions = {},
  ): Promise<boolean> {
    return this.store(key, value, options, expectedTagEpochs)
  }

  async del(key: string | string[]): Promise<void> {
    const keys = (Array.isArray(key) ? key : [key]).map((k) => this.k(k))
    if (!keys.length) return
    if (this.client.eval) {
      const pairs = keys.flatMap((fullKey) => [fullKey, this.reverseKey(fullKey)])
      await this.client.eval(DELETE_WITH_TAGS_SCRIPT, pairs.length, ...pairs)
      return
    }
    for (const fullKey of keys) {
      const reverseKey = this.reverseKey(fullKey)
      const tags = await this.client.smembers(reverseKey)
      await Promise.all(tags.map((tagKey) => this.client.srem?.(tagKey, fullKey)))
      await this.client.del(fullKey, reverseKey)
    }
  }

  async invalidateTag(tag: string | string[]): Promise<void> {
    const tags = Array.isArray(tag) ? tag : [tag]
    const tagKeys = tags.flatMap((t) => [this.tagKey(t), this.tagEpochKey(t)])
    if (!tagKeys.length) return
    if (this.client.eval) {
      // Atomic path: SMEMBERS→DEL happen inside one script, immune to a
      // concurrent `set()` stranding a freshly-tagged key.
      await this.client.eval(
        INVALIDATE_TAG_SCRIPT,
        tagKeys.length,
        ...tagKeys,
        this.k(KEY_TAGS_PREFIX),
      )
      return
    }
    // Fallback for clients without EVAL — non-atomic and racy under
    // concurrent writes. Prefer a client that supports scripting.
    const allKeys: string[] = []
    for (let i = 0; i < tagKeys.length; i += 2) {
      const tagKey = tagKeys[i]!
      const epochKey = tagKeys[i + 1]!
      const epoch = Number((await this.client.get(epochKey)) ?? 0) + 1
      await this.client.set(epochKey, epoch)
      const members = await this.client.smembers(tagKey)
      for (const member of members) {
        const reverseKey = this.reverseKey(member)
        const memberTags = await this.client.smembers(reverseKey)
        await Promise.all(memberTags.map((memberTag) => this.client.srem?.(memberTag, member)))
        allKeys.push(member, reverseKey)
      }
      allKeys.push(tagKey)
    }
    if (allKeys.length) await this.client.del(...allKeys)
  }

  async acquireLock(key: string, token: string, ttlMs: number): Promise<boolean> {
    const result = await this.client.set(this.lockKey(key), token, 'PX', ttlMs, 'NX')
    return result === 'OK'
  }

  async releaseLock(key: string, token: string): Promise<void> {
    const lockKey = this.lockKey(key)
    if (this.client.eval) {
      await this.client.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, token)
      return
    }
    if ((await this.client.get(lockKey)) === token) await this.client.del(lockKey)
  }

  async subscribe(channel: string, handler: (message: string) => void): Promise<() => void> {
    const sub = this.subscriber ?? this.client.duplicate?.()
    if (!sub || !sub.subscribe || !sub.on) {
      throw new Error('Redis client cannot subscribe — provide options.subscriber')
    }
    const fullChannel = this.k(channel)
    await sub.subscribe(fullChannel)
    const listener = (incoming: string, message: string): void => {
      if (incoming === fullChannel) handler(message)
    }
    sub.on('message', listener)
    return async () => {
      // ioredis exposes `unsubscribe` on the same client; we keep the cleanup
      // best-effort to avoid coupling to the full ioredis surface.
      const anySub = sub as unknown as {
        unsubscribe?: (channel: string) => Promise<unknown>
        off?: (event: string, fn: unknown) => unknown
      }
      if (typeof anySub.unsubscribe === 'function') await anySub.unsubscribe(fullChannel)
      if (typeof anySub.off === 'function') anySub.off('message', listener)
    }
  }

  async publish(channel: string, message: string): Promise<void> {
    if (!this.client.publish) return
    await this.client.publish(this.k(channel), message)
  }
}

/**
 * Convenience factory: spin up the cache provider directly from a Redis
 * connection URL, hiding ioredis import + dual-client (main + subscriber)
 * boilerplate from consumers.
 *
 * Usage:
 *   const cache = process.env.REDIS_URL
 *     ? createRedisCacheProvider({ url: process.env.REDIS_URL })
 *     : undefined
 *
 * Requires `ioredis` to be installed (declared as a peer dependency of this
 * package). If you already manage your Redis client(s) elsewhere, instantiate
 * `RedisCacheProvider` directly instead.
 */
export interface CreateRedisCacheProviderOptions {
  url: string
  prefix?: string
  defaultTtl?: number
  tagTtl?: number
  logger?: ILogger
}

export function createRedisCacheProvider(
  opts: CreateRedisCacheProviderOptions,
): RedisCacheProvider {
  // Dynamic require keeps ioredis a true peer dep — pulled in only when this
  // helper is actually called, not when the module is merely imported.
  const Redis = require_('ioredis') as new (url: string) => RedisLike
  return new RedisCacheProvider({
    client: new Redis(opts.url),
    subscriber: new Redis(opts.url),
    ...(opts.prefix !== undefined ? { prefix: opts.prefix } : {}),
    ...(opts.defaultTtl !== undefined ? { defaultTtl: opts.defaultTtl } : {}),
    ...(opts.tagTtl !== undefined ? { tagTtl: opts.tagTtl } : {}),
    ...(opts.logger !== undefined ? { logger: opts.logger } : {}),
  })
}
