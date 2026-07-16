// @modern-admin/cache-redis — ICacheProvider implementation backed by an
// ioredis (or compatible) client. Tag invalidation is implemented via Redis
// SETs that map a tag to the keys it covers; mutating a record drops the set
// and all referenced keys in one round-trip.
//
// Invalidation runs inside a single Lua script (EVAL) so the SMEMBERS→DEL
// pair is atomic: without it, a concurrent `set()` that SADDs a fresh key
// into the tag set between our read and delete would leave that key cached
// while we delete the tag set, stranding a stale entry that no later
// invalidation could ever reach. Tag SETs also carry an expiry so abandoned
// tags cannot accumulate forever.

import { createRequire } from 'node:module'
import type { CacheSetOptions, ICacheProvider } from '@modern-admin/core'

const require_ = createRequire(import.meta.url)

// Structurally compatible with `ioredis.Redis` (and node-redis-style clients).
// `set`/`sadd`/`del`/`publish` value types are widened to `string | number | Buffer`
// and `set` is exposed as two overloads (with and without TTL) so the real
// ioredis client — which has a dozen overloads on the same method — assigns
// without requiring `as unknown as RedisLike` at the call site.
export interface RedisLike {
  get(key: string): Promise<string | null>
  set(key: string, value: string | number | Buffer): Promise<unknown>
  set(key: string, value: string | number | Buffer, mode: 'EX', ttl: number | string): Promise<unknown>
  del(...keys: string[]): Promise<unknown>
  sadd(key: string, ...values: (string | number | Buffer)[]): Promise<unknown>
  smembers(key: string): Promise<string[]>
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
   * TTL floor (seconds) applied to every tag SET so abandoned tags cannot
   * grow unbounded. Refreshed on each `set()` that references the tag, and
   * always at least as long as the covered entry's own TTL. Must exceed the
   * longest-lived cache entry it covers, or a tag could expire while a member
   * is still cached (leaving that member un-invalidatable). Defaults to 30
   * days. Pass `0` to opt out and keep tag SETs persistent.
   */
  tagTtl?: number
  /** Optional dedicated subscriber client (ioredis requires it). */
  subscriber?: RedisLike
}

const TAG_PREFIX = 'tag:'

// Default TTL floor for tag SETs — 30 days. Comfortably longer than any
// realistic cache-entry TTL, so tags outlive their members while still
// self-expiring once a resource stops being written.
const DEFAULT_TAG_TTL = 60 * 60 * 24 * 30

// Atomic tag invalidation. For each tag SET passed in KEYS, delete every key
// it references and then the SET itself, all within one script so a
// concurrent `set()` cannot interleave a fresh member between the read and
// the delete. Returns the number of cache keys removed.
const INVALIDATE_TAG_SCRIPT = `
local removed = 0
for i = 1, #KEYS do
  local members = redis.call('SMEMBERS', KEYS[i])
  for j = 1, #members do
    removed = removed + redis.call('DEL', members[j])
  end
  redis.call('DEL', KEYS[i])
end
return removed
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

  constructor(opts: RedisCacheOptions) {
    this.client = opts.client
    this.prefix = opts.prefix ?? 'ma:'
    if (opts.defaultTtl !== undefined) this.defaultTtl = opts.defaultTtl
    this.tagTtl = opts.tagTtl ?? DEFAULT_TAG_TTL
    this.subscriber = opts.subscriber
  }

  private k(key: string): string {
    return `${this.prefix}${key}`
  }

  private tagKey(tag: string): string {
    return this.k(`${TAG_PREFIX}${tag}`)
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
    const ttl = options.ttl ?? this.defaultTtl
    const fullKey = this.k(key)
    const payload = JSON.stringify(value, stringifyReplacer)
    if (ttl != null) await this.client.set(fullKey, payload, 'EX', ttl)
    else await this.client.set(fullKey, payload)
    if (options.tags && options.tags.length) {
      // Bound tag SETs with an expiry so abandoned tags self-clean. The floor
      // is `tagTtl`; when the entry's own TTL is longer we extend to that so
      // the tag never expires before a member it still covers. Every write
      // that touches the tag refreshes this window.
      const tagExpiry = Math.max(ttl ?? 0, this.tagTtl)
      await Promise.all(
        options.tags.map(async (tag) => {
          const tagKey = this.tagKey(tag)
          await this.client.sadd(tagKey, fullKey)
          if (tagExpiry > 0) await this.client.expire?.(tagKey, tagExpiry)
        }),
      )
    }
  }

  async del(key: string | string[]): Promise<void> {
    const keys = (Array.isArray(key) ? key : [key]).map((k) => this.k(k))
    if (keys.length) await this.client.del(...keys)
  }

  async invalidateTag(tag: string | string[]): Promise<void> {
    const tags = Array.isArray(tag) ? tag : [tag]
    const tagKeys = tags.map((t) => this.tagKey(t))
    if (!tagKeys.length) return
    if (this.client.eval) {
      // Atomic path: SMEMBERS→DEL happen inside one script, immune to a
      // concurrent `set()` stranding a freshly-tagged key.
      await this.client.eval(INVALIDATE_TAG_SCRIPT, tagKeys.length, ...tagKeys)
      return
    }
    // Fallback for clients without EVAL — non-atomic and racy under
    // concurrent writes. Prefer a client that supports scripting.
    const allKeys: string[] = []
    for (const tagKey of tagKeys) {
      const members = await this.client.smembers(tagKey)
      allKeys.push(...members, tagKey)
    }
    if (allKeys.length) await this.client.del(...allKeys)
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
      const anySub = sub as unknown as { unsubscribe?: (channel: string) => Promise<unknown>; off?: (event: string, fn: unknown) => unknown }
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
  })
}
