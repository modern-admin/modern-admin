/** Bump when a cached response wire shape changes incompatibly. Old entries
 * remain isolated and expire naturally under the provider TTL. */
export const CACHE_KEY_VERSION = 'v1'

const canonicalValue = (value: unknown): unknown => {
  if (value === undefined) return { $type: 'undefined' }
  if (typeof value === 'bigint') return { $type: 'bigint', value: value.toString() }
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return { $type: 'number', value: 'NaN' }
    if (value === Number.POSITIVE_INFINITY) return { $type: 'number', value: 'Infinity' }
    if (value === Number.NEGATIVE_INFINITY) return { $type: 'number', value: '-Infinity' }
    if (Object.is(value, -0)) return { $type: 'number', value: '-0' }
    return value
  }
  if (value instanceof Date) return { $type: 'date', value: value.toISOString() }
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      result[key] = canonicalValue((value as Record<string, unknown>)[key])
    }
    return result
  }
  return value
}

/** Deterministic, recursive, type-preserving JSON representation for cache
 * key dimensions. Object keys are sorted; array order remains significant. */
export const stableCacheStringify = (value: unknown): string =>
  JSON.stringify(canonicalValue(value))

export const cacheKey = (namespace: string, ...segments: string[]): string =>
  [CACHE_KEY_VERSION, namespace, ...segments].join(':')

export const listCacheKey = (
  resourceId: string,
  dimensions: {
    filters: Record<string, unknown>
    page: number
    perPage: number
    sortBy?: string
    direction?: 'asc' | 'desc'
  },
): string => cacheKey('list', resourceId, stableCacheStringify(dimensions))

export const recordCacheKey = (resourceId: string, recordId: string): string =>
  cacheKey('record', resourceId, recordId)

export const searchCacheKey = (resourceId: string, query: string): string =>
  cacheKey('search', resourceId, query)
