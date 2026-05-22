// @modern-admin/cache-redis — ICacheProvider implementation backed by an
// ioredis (or compatible) client. Tag invalidation is implemented via Redis
// SETs that map a tag to the keys it covers; mutating a record drops the set
// and all referenced keys in one round-trip.

import type { CacheSetOptions, ICacheProvider } from '@modern-admin/core'

interface RedisLike {
  get(key: string): Promise<string | null>
  set(key: string, value: string, mode?: 'EX', ttl?: number): Promise<unknown>
  del(...keys: string[]): Promise<unknown>
  sadd(key: string, ...values: string[]): Promise<unknown>
  smembers(key: string): Promise<string[]>
  publish?(channel: string, message: string): Promise<unknown>
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
  /** Optional dedicated subscriber client (ioredis requires it). */
  subscriber?: RedisLike
}

const TAG_PREFIX = 'tag:'

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

  constructor(opts: RedisCacheOptions) {
    this.client = opts.client
    this.prefix = opts.prefix ?? 'ma:'
    if (opts.defaultTtl !== undefined) this.defaultTtl = opts.defaultTtl
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
      await Promise.all(
        options.tags.map((tag) => this.client.sadd(this.tagKey(tag), fullKey)),
      )
    }
  }

  async del(key: string | string[]): Promise<void> {
    const keys = (Array.isArray(key) ? key : [key]).map((k) => this.k(k))
    if (keys.length) await this.client.del(...keys)
  }

  async invalidateTag(tag: string | string[]): Promise<void> {
    const tags = Array.isArray(tag) ? tag : [tag]
    const allKeys: string[] = []
    for (const t of tags) {
      const tagKey = this.tagKey(t)
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
