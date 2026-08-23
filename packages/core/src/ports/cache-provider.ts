/**
 * Cache abstraction. Adapters supply a concrete implementation
 * (e.g. Redis, in-memory). Tags allow targeted invalidation when records
 * mutate without scanning all keys.
 */
export interface ICacheProvider {
  /** `null` is reserved for a miss. Wrap negative results in a non-null
   * envelope when they need to be cached. */
  get<T = unknown>(key: string): Promise<T | null>

  set<T = unknown>(key: string, value: T, options?: CacheSetOptions): Promise<void>

  del(key: string | string[]): Promise<void>

  invalidateTag(tag: string | string[]): Promise<void>

  /** Read the current cross-instance generation of each tag. Providers that
   * implement this together with `setIfTagEpochsMatch` offer atomic fencing
   * against writes computed before a tag invalidation. */
  getTagEpochs?(tags: string[]): Promise<CacheTagEpochs>

  /** Store only when every tag still has the expected generation. Returns
   * false when an invalidation raced the caller. */
  setIfTagEpochsMatch?<T = unknown>(
    key: string,
    value: T,
    expectedTagEpochs: CacheTagEpochs,
    options?: CacheSetOptions,
  ): Promise<boolean>

  /** Optional distributed single-flight primitives. */
  acquireLock?(key: string, token: string, ttlMs: number): Promise<boolean>
  releaseLock?(key: string, token: string): Promise<void>

  /** Optional pub/sub for cross-instance invalidation hooks. */
  subscribe?(channel: string, handler: (message: string) => void): Promise<() => void>

  publish?(channel: string, message: string): Promise<void>
}

export interface CacheSetOptions {
  /** TTL in seconds. */
  ttl?: number
  tags?: string[]
  /** Positive TTL jitter. `0.1` produces a TTL in `[ttl, ttl * 1.1)`. */
  jitterRatio?: number
}

export type CacheTagEpochs = Record<string, string>

/**
 * No-op cache: every read misses, every write is a no-op. Used as the
 * default so the framework runs without a Redis connection in dev/tests.
 */
export class NoopCacheProvider implements ICacheProvider {
  async get<T>(): Promise<T | null> {
    return null
  }

  async set(): Promise<void> {
    // no-op
  }

  async del(): Promise<void> {
    // no-op
  }

  async invalidateTag(): Promise<void> {
    // no-op
  }

  async getTagEpochs(tags: string[]): Promise<CacheTagEpochs> {
    return Object.fromEntries(tags.map((tag) => [tag, '0']))
  }

  async setIfTagEpochsMatch(): Promise<boolean> {
    return true
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
  private readonly tagEpochs = new Map<string, number>()
  private readonly maxEntries: number

  constructor(options: { maxEntries?: number } = {}) {
    this.maxEntries = Math.max(0, options.maxEntries ?? 10_000)
  }

  private removeEntry(key: string): void {
    const entry = this.entries.get(key)
    if (!entry) return
    this.entries.delete(key)
    for (const tag of entry.tags) {
      const bucket = this.tagIndex.get(tag)
      bucket?.delete(key)
      if (bucket?.size === 0) this.tagIndex.delete(tag)
    }
  }

  private applySet<T>(key: string, value: T, options: CacheSetOptions): void {
    this.removeEntry(key)
    if (this.maxEntries === 0) return
    const baseTtl = options.ttl
    const ratio = Math.max(0, options.jitterRatio ?? 0)
    const ttl = baseTtl != null && baseTtl > 0
      ? baseTtl + Math.floor(Math.random() * ratio * baseTtl)
      : baseTtl
    const ttlMs = ttl != null && ttl > 0 ? ttl * 1000 : Number.POSITIVE_INFINITY
    const tags = Array.from(new Set(options.tags ?? []))
    this.entries.set(key, { value, tags, expiresAt: Date.now() + ttlMs })
    for (const tag of tags) {
      let bucket = this.tagIndex.get(tag)
      if (!bucket) {
        bucket = new Set()
        this.tagIndex.set(tag, bucket)
      }
      bucket.add(key)
    }
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value as string | undefined
      if (oldest === undefined) break
      this.removeEntry(oldest)
    }
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const entry = this.entries.get(key)
    if (!entry) return null
    if (entry.expiresAt <= Date.now()) {
      this.removeEntry(key)
      return null
    }
    // Refresh insertion order so the size bound behaves as an LRU.
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.value as T
  }

  async set<T = unknown>(key: string, value: T, options: CacheSetOptions = {}): Promise<void> {
    this.applySet(key, value, options)
  }

  async del(key: string | string[]): Promise<void> {
    const list = Array.isArray(key) ? key : [key]
    for (const k of list) this.removeEntry(k)
  }

  async invalidateTag(tag: string | string[]): Promise<void> {
    const tags = Array.isArray(tag) ? tag : [tag]
    for (const t of tags) {
      this.tagEpochs.set(t, (this.tagEpochs.get(t) ?? 0) + 1)
      const bucket = this.tagIndex.get(t)
      if (!bucket) continue
      for (const key of Array.from(bucket)) this.removeEntry(key)
    }
  }

  async getTagEpochs(tags: string[]): Promise<CacheTagEpochs> {
    return Object.fromEntries(tags.map((tag) => [tag, String(this.tagEpochs.get(tag) ?? 0)]))
  }

  async setIfTagEpochsMatch<T = unknown>(
    key: string,
    value: T,
    expectedTagEpochs: CacheTagEpochs,
    options: CacheSetOptions = {},
  ): Promise<boolean> {
    for (const tag of options.tags ?? []) {
      if (String(this.tagEpochs.get(tag) ?? 0) !== (expectedTagEpochs[tag] ?? '0')) return false
    }
    await this.set(key, value, options)
    return true
  }
}
