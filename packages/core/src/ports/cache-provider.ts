/**
 * Cache abstraction. Adapters supply a concrete implementation
 * (e.g. Redis, in-memory). Tags allow targeted invalidation when records
 * mutate without scanning all keys.
 */
export interface ICacheProvider {
  get<T = unknown>(key: string): Promise<T | null>

  set<T = unknown>(key: string, value: T, options?: CacheSetOptions): Promise<void>

  del(key: string | string[]): Promise<void>

  invalidateTag(tag: string | string[]): Promise<void>

  /** Optional pub/sub for cross-instance invalidation hooks. */
  subscribe?(channel: string, handler: (message: string) => void): Promise<() => void>

  publish?(channel: string, message: string): Promise<void>
}

export interface CacheSetOptions {
  /** TTL in seconds. */
  ttl?: number
  tags?: string[]
}

/**
 * No-op cache: every read misses, every write is a no-op. Used as the
 * default so the framework runs without a Redis connection in dev/tests.
 */
export class NoopCacheProvider implements ICacheProvider {
  async get<T>(): Promise<T | null> {
    return null
  }

  async set<T>(): Promise<void> {
    // no-op
  }

  async del(): Promise<void> {
    // no-op
  }

  async invalidateTag(): Promise<void> {
    // no-op
  }
}

interface MemoryEntry {
  value: unknown
  tags: string[]
  /** Epoch ms when the entry expires. `Infinity` = never. */
  expiresAt: number
}

/**
 * In-process cache provider with TTL and tag invalidation. Backed by a
 * plain Map — every entry lives only in the current process. Intended for
 * single-instance demos, e2e tests, and local development; multi-instance
 * deployments should use `RedisCacheProvider` (from `@modern-admin/cache-redis`)
 * to share invalidation across nodes.
 *
 * Expired entries are reaped lazily on read; there is no background timer
 * because all e2e/test consumers are short-lived processes.
 */
export class MemoryCacheProvider implements ICacheProvider {
  private readonly entries = new Map<string, MemoryEntry>()
  private readonly tagIndex = new Map<string, Set<string>>()

  async get<T = unknown>(key: string): Promise<T | null> {
    const entry = this.entries.get(key)
    if (!entry) return null
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key)
      return null
    }
    return entry.value as T
  }

  async set<T = unknown>(key: string, value: T, options: CacheSetOptions = {}): Promise<void> {
    const ttlMs = options.ttl != null ? options.ttl * 1000 : Number.POSITIVE_INFINITY
    const tags = options.tags ?? []
    this.entries.set(key, {value, tags, expiresAt: Date.now() + ttlMs})
    for (const tag of tags) {
      let bucket = this.tagIndex.get(tag)
      if (!bucket) {
        bucket = new Set()
        this.tagIndex.set(tag, bucket)
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
      const bucket = this.tagIndex.get(t)
      if (!bucket) continue
      for (const key of bucket) this.entries.delete(key)
      this.tagIndex.delete(t)
    }
  }
}
