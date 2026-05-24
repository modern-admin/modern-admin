import { z } from 'zod'
import { propertyOptionsZ, type PropertyOptions } from './property-options.js'
import { actionOptionsZ } from './action-options.js'

/**
 * Per-read-action cache override. `enabled: false` skips the cache for that
 * action regardless of strategy/TTL; `ttl` overrides the resolved value.
 */
export const cacheActionOptionsZ = z.object({
  enabled: z.boolean().optional(),
  /** TTL in seconds. Wins over the resource-level `ttl`. */
  ttl: z.number().int().nonnegative().optional(),
})

export type CacheActionOptions = z.infer<typeof cacheActionOptionsZ>

/**
 * Strategy for read-action response caching at the resource level.
 *
 *  - `'ttl'` (default): use the configured TTL (resource-level or
 *    per-action). Standard cache-then-invalidate behaviour.
 *  - `'tag-only'`: TTL is effectively long-lived (30 days). Cache is
 *    kept until a mutation invalidates the tag. Use for reference
 *    data that changes rarely or only via the admin layer.
 *  - `'off'`: bypass the cache entirely (both reads and writes). The
 *    mutation hooks still invalidate tags so flipping back to `'ttl'`
 *    or `'tag-only'` later doesn't surface stale entries.
 */
export const cacheStrategyZ = z.enum(['ttl', 'tag-only', 'off'])

export type CacheStrategy = z.infer<typeof cacheStrategyZ>

/**
 * Per-resource cache configuration. Accepts a literal `false` as a
 * shorthand for `{ strategy: 'off' }`.
 *
 * Per-action overrides (`list`, `show`, `search`, `http`) win over the
 * resource-level `ttl` / `strategy`. The `http` slot governs the
 * NestJS-level response interceptor; the rest govern the action-level
 * cache that lives inside the read handlers.
 */
export const cacheOptionsObjectZ = z.object({
  strategy: cacheStrategyZ.optional(),
  /** Resource-level default TTL applied to every read action. Seconds. */
  ttl: z.number().int().nonnegative().optional(),
  list: cacheActionOptionsZ.optional(),
  show: cacheActionOptionsZ.optional(),
  search: cacheActionOptionsZ.optional(),
  http: cacheActionOptionsZ.optional(),
})

export const cacheOptionsZ = z.union([z.literal(false), cacheOptionsObjectZ])

export type CacheOptions = z.infer<typeof cacheOptionsZ>

export const navigationZ = z
  .object({
    name: z.string().optional(),
    icon: z.string().optional(),
    /** Group label for the sidebar. */
    group: z.string().optional(),
  })
  .or(z.null())

/**
 * Describes a sibling resource whose records reference the current one
 * through `foreignKey`. The frontend renders one tab per entry on the show
 * page, listing matching records pre-filtered by the open record's id.
 */
export const relatedResourceZ = z.object({
  /** Target resource id (the one *containing* the foreign key). */
  resourceId: z.string(),
  /** Property path on the target resource that points back to us. */
  foreignKey: z.string(),
  /** Optional tab label override; falls back to the target resource name. */
  label: z.string().optional(),
})

export type RelatedResource = z.infer<typeof relatedResourceZ>

export const resourceOptionsZ = z.object({
  /** Override sidebar / route id. Defaults to `resource.id()`. */
  id: z.string().optional(),
  /** Display name; defaults to a humanized id. */
  name: z.string().optional(),
  /** Property path to use as the record title in lists, breadcrumbs and
   *  audit logs. Overrides the automatic TITLE_COLUMN_NAMES detection. */
  titleProperty: z.string().optional(),
  navigation: navigationZ.optional(),
  /** Per-property overrides keyed by property path. */
  properties: z.record(z.string(), propertyOptionsZ).optional(),
  /** Per-action overrides; values get merged into BUILT_IN_ACTIONS. */
  actions: z.record(z.string(), actionOptionsZ).optional(),
  /** Listing defaults — props & sort. */
  listProperties: z.array(z.string()).optional(),
  showProperties: z.array(z.string()).optional(),
  editProperties: z.array(z.string()).optional(),
  filterProperties: z.array(z.string()).optional(),
  sort: z
    .object({
      sortBy: z.string(),
      direction: z.enum(['asc', 'desc']),
    })
    .optional(),
  /** Reverse 1:N relations to render as tabs on the show page. */
  relatedResources: z.array(relatedResourceZ).optional(),
  /**
   * Server-side response cache configuration for this resource. See
   * `cacheOptionsZ` / `resolveResourceCacheConfig` for the resolution
   * rules. When omitted, defaults apply (TTL strategy, 5-minute TTL for
   * list/show/http, 60s for search).
   */
  cache: cacheOptionsZ.optional(),
})

export type ResourceOptions = Omit<
  z.infer<typeof resourceOptionsZ>,
  'properties'
> & {
  /** Per-property overrides keyed by property path. */
  properties?: Record<string, PropertyOptions>
}
