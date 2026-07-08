// Cross-instance cache invalidation.
//
// `invalidateTag()` on a shared store (Redis) already propagates by virtue
// of the store being shared — but per-process caches (MemoryCacheProvider)
// and any provider-side local tiers do not see invalidations performed by
// sibling instances. When the underlying provider exposes the optional
// `publish`/`subscribe` pair, this wrapper broadcasts every tag
// invalidation on a well-known channel and applies invalidations received
// from other instances to the local provider.
//
// The wrapper is transparent: reads/writes delegate untouched, and a
// provider without pub/sub support is returned as-is by
// `withCrossInstanceInvalidation()`.

import type { CacheSetOptions, ICacheProvider } from './cache-provider.js'
import { uuidv7 } from '../utils/uuid.js'

/** Channel used for cache invalidation broadcasts. Providers may prefix it
 *  (RedisCacheProvider applies its key prefix). */
export const CACHE_INVALIDATION_CHANNEL = 'cache:invalidate'

interface InvalidationMessage {
  /** Originating instance — used to skip self-delivered messages. */
  src: string
  tags: string[]
}

export class CrossInstanceCacheProvider implements ICacheProvider {
  /** Identifies this process so self-published messages are ignored. */
  private readonly instanceId = uuidv7()
  private unsubscribe: (() => void) | null = null
  private readonly ready: Promise<void>

  constructor(private readonly inner: ICacheProvider) {
    this.ready = this.startSubscription()
  }

  private async startSubscription(): Promise<void> {
    if (!this.inner.subscribe) return
    try {
      this.unsubscribe = await this.inner.subscribe(
        CACHE_INVALIDATION_CHANNEL,
        (message) => {
          void this.applyRemote(message)
        },
      )
    } catch (err) {
      // A provider that advertises subscribe() but cannot establish the
      // subscription (e.g. Redis client without a subscriber connection)
      // degrades to shared-store-only invalidation instead of failing boot.
      console.warn('[modern-admin] cache invalidation subscription failed:', err)
    }
  }

  private async applyRemote(message: string): Promise<void> {
    let parsed: InvalidationMessage
    try {
      parsed = JSON.parse(message) as InvalidationMessage
    } catch {
      return
    }
    if (!parsed || parsed.src === this.instanceId || !Array.isArray(parsed.tags)) return
    try {
      // Bypass the broadcasting override — remote invalidations must not
      // be re-published (broadcast storms).
      await this.inner.invalidateTag(parsed.tags)
    } catch {
      // Local invalidation failures must not crash the subscriber loop;
      // the entry still dies by TTL.
    }
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    return this.inner.get<T>(key)
  }

  async set<T = unknown>(key: string, value: T, options?: CacheSetOptions): Promise<void> {
    return this.inner.set(key, value, options)
  }

  async del(key: string | string[]): Promise<void> {
    return this.inner.del(key)
  }

  async invalidateTag(tag: string | string[]): Promise<void> {
    const tags = Array.isArray(tag) ? tag : [tag]
    await this.inner.invalidateTag(tags)
    if (this.inner.publish) {
      try {
        await this.inner.publish(
          CACHE_INVALIDATION_CHANNEL,
          JSON.stringify({ src: this.instanceId, tags } satisfies InvalidationMessage),
        )
      } catch {
        // Broadcast failures degrade to shared-store semantics; sibling
        // instances converge via TTL.
      }
    }
  }

  async publish(channel: string, message: string): Promise<void> {
    await this.inner.publish?.(channel, message)
  }

  async subscribe(
    channel: string,
    handler: (message: string) => void,
  ): Promise<() => void> {
    if (!this.inner.subscribe) return () => {}
    return this.inner.subscribe(channel, handler)
  }

  /** Await the initial subscription attempt (test/bootstrap hook). */
  async whenReady(): Promise<void> {
    await this.ready
  }

  /** Tear down the invalidation subscription (graceful shutdown). */
  async dispose(): Promise<void> {
    await this.ready
    this.unsubscribe?.()
    this.unsubscribe = null
  }
}

/**
 * Wrap a provider with cross-instance invalidation when it supports
 * pub/sub; return it unchanged otherwise. `ModernAdmin` applies this to
 * the configured cache automatically.
 */
export function withCrossInstanceInvalidation(cache: ICacheProvider): ICacheProvider {
  if (!cache.publish && !cache.subscribe) return cache
  if (cache instanceof CrossInstanceCacheProvider) return cache
  return new CrossInstanceCacheProvider(cache)
}
