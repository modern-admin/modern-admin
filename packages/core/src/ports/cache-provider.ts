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
