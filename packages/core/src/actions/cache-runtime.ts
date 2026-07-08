// CacheRuntime — read-side cache coordinator shared by built-in actions and
// the NestJS HTTP interceptor.
//
// Responsibilities:
//   1. Read-through against the configured `ICacheProvider`.
//   2. In-flight request deduplication. Concurrent cache misses for the
//      same key wait on a single underlying fetch instead of fanning out
//      to the database (thundering-herd protection).
//   3. Honour `{ enabled: false }` — bypass the cache entirely, but still
//      run the fetch and dedup it (a coalesce-only mode is useful even
//      when caching is off, e.g. when the resource has `cache: false`).
//
// Tag naming convention used across the framework:
//   * list/search responses → `list:<resourceId>`
//   * show responses        → `record:<resourceId>:<recordId>`
// Mutation actions invalidate one or both of these depending on what
// they touched (see `list`/`record` tag helpers below).

import type { ICacheProvider } from '../ports/cache-provider.js'

export interface CacheRuntimeReadOptions {
  /** When false, the cache is bypassed but in-flight dedup still applies. */
  enabled: boolean
  /** TTL in seconds. Only used when `enabled` is true. */
  ttl: number
  /** Tags attached to the cached entry. Only used when `enabled` is true. */
  tags?: string[]
}

/**
 * Tag for list/search response caches. One per resource — covers every
 * page, filter combination, sort order, and search query.
 */
export const listTag = (resourceId: string): string => `list:${resourceId}`

/**
 * Tag for a single show response. Scoped to one record so mutating one
 * record never invalidates show caches for siblings.
 */
export const recordTag = (resourceId: string, recordId: string): string =>
  `record:${resourceId}:${recordId}`

/**
 * Resource-wide tag attached to every show/record-scoped cache entry in
 * addition to its per-record tag. Lets cross-resource invalidation drop
 * *all* cached record responses of a resource at once — needed when a
 * referenced/related resource changes and the ids of the affected parent
 * records are unknown (populated references, m2m hydration).
 */
export const recordsTag = (resourceId: string): string => `records:${resourceId}`

export class CacheRuntime {
  private readonly inFlight = new Map<string, Promise<unknown>>()

  constructor(public readonly cache: ICacheProvider) {}

  /**
   * Read-through with in-flight dedup. Steps:
   *
   *   1. If caching is enabled and the key is hot, return it.
   *   2. If a previous concurrent caller is already fetching the same
   *      key, await its promise (single DB round-trip).
   *   3. Otherwise run the supplied `fetch()`, store the result (if
   *      caching is enabled), and resolve.
   *
   * The in-flight entry is removed in a `finally` so a failed fetch
   * doesn't leave a poisoned promise behind.
   */
  async read<T>(
    key: string,
    options: CacheRuntimeReadOptions,
    fetch: () => Promise<T>,
  ): Promise<T> {
    if (options.enabled) {
      const hit = await this.cache.get<T>(key)
      if (hit !== null && hit !== undefined) return hit
    }

    const existing = this.inFlight.get(key) as Promise<T> | undefined
    if (existing) return existing

    const pending = (async () => {
      try {
        const value = await fetch()
        if (options.enabled) {
          await this.cache.set(key, value, {
            ttl: options.ttl,
            ...(options.tags && options.tags.length ? { tags: options.tags } : {}),
          })
        }
        return value
      } finally {
        this.inFlight.delete(key)
      }
    })()
    this.inFlight.set(key, pending as Promise<unknown>)
    return pending
  }

  /** Pass-through to the underlying provider. Exposed so mutation
   *  actions can drop tags without reaching into `context.cache`
   *  directly — keeps the contract centralised. */
  async invalidateTags(tags: string | string[]): Promise<void> {
    await this.cache.invalidateTag(tags)
  }

  /** Test-only inspection: number of currently in-flight keys. */
  get inFlightSize(): number {
    return this.inFlight.size
  }
}
