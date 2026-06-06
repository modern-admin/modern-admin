// Read-side cache config resolution.
//
// Built-in read actions (`list`, `show`, `search`) and the NestJS HTTP
// interceptor call `resolveResourceCacheConfig(options, action)` to turn
// the optional `ResourceOptions.cache` shape into a flat
// `{ enabled, ttl }` decision. Mutation actions don't need this — they
// always invalidate tags regardless of the read-side strategy, so that
// flipping a resource from `cache: { strategy: 'off' }` to
// `'tag-only'` later doesn't resurrect stale entries.

import type { CacheOptions, ResourceOptions } from './resource-options.js'

export type CacheReadAction = 'list' | 'show' | 'search' | 'http'

export interface ResolvedCacheConfig {
  enabled: boolean
  /** TTL in seconds. Zero is allowed; means "set without expiry from the
   *  provider's perspective" — providers that honour `defaultTtl` will
   *  fall back to that. The built-in actions always pass an explicit
   *  positive value (or 0 when disabled). */
  ttl: number
}

/** Strategy `'tag-only'` substitutes this TTL — ~30 days. The cache is
 *  expected to live until a mutation invalidates its tag; the TTL is
 *  only a last-resort eviction. */
export const TAG_ONLY_TTL_SECONDS = 30 * 24 * 60 * 60

/**
 * Resource-level defaults applied when the option object does not pin
 * a `ttl` for the action. Picked so the cache is meaningfully warm
 * across typical admin sessions while still expiring on the order of
 * minutes for safety against out-of-band writes.
 */
export const DEFAULT_TTL_SECONDS: Record<CacheReadAction, number> = {
  list: 300,
  show: 300,
  search: 60,
  http: 300,
}

export const DISABLED: ResolvedCacheConfig = { enabled: false, ttl: 0 }

export function resolveResourceCacheConfig(
  options: ResourceOptions | undefined,
  action: CacheReadAction,
): ResolvedCacheConfig {
  const cfg: CacheOptions | undefined = options?.cache
  if (cfg === false) return DISABLED

  const strategy = cfg?.strategy ?? 'ttl'
  if (strategy === 'off') return DISABLED

  const perAction = cfg?.[action]
  if (perAction?.enabled === false) return DISABLED

  // Per-action TTL wins, then resource-level TTL, then strategy default,
  // then the action default.
  const ttl =
    perAction?.ttl ??
    (strategy === 'tag-only'
      ? TAG_ONLY_TTL_SECONDS
      : (cfg?.ttl ?? DEFAULT_TTL_SECONDS[action]))

  return { enabled: true, ttl }
}
