import { Filter } from '../../filter/filter.js'
import type { Action, ActionRequest, ActionContext, ListActionResponse } from '../action.js'
import { listTag } from '../cache-runtime.js'
import { resolveResourceCacheConfig } from '../../decorators/cache-config.js'
import type { BaseRecord, BaseResource } from '../../adapters'
import type { ModernAdmin } from '../../modern-admin.js'

const DEFAULT_PER_PAGE = 20

/**
 * Batch-populate scalar reference properties so the client doesn't fire one
 * `show` request per row to render reference cells. For each property whose
 * `reference()` resolves to another registered resource we collect the unique
 * foreign-key values across the page's records and fetch them in a single
 * `findMany`, then attach the result via `record.populate(path, related)`.
 *
 * Array references (m2m / reverse-to-many) are intentionally skipped — m2m
 * carries embedded id+extras objects in `params` already, and reverse-to-many
 * relations are surfaced through dedicated related-records tables.
 */
const populateReferences = async (
  records: BaseRecord[],
  resource: BaseResource,
  admin: ModernAdmin,
): Promise<void> => {
  if (records.length === 0) return
  const refs = resource.properties().filter((p) =>
    p.reference() !== null && !p.isArray() && !p.isId(),
  )
  if (refs.length === 0) return

  await Promise.all(refs.map(async (prop) => {
    const referencedId = prop.reference()
    if (!referencedId) return
    let referenced: BaseResource
    try {
      referenced = admin.findResource(referencedId)
    } catch {
      return
    }
    const path = prop.path()
    const ids = new Set<string>()
    for (const record of records) {
      const value = record.get(path)
      if (value == null || value === '') continue
      ids.add(String(value))
    }
    if (ids.size === 0) return
    const related = await referenced.findMany(Array.from(ids))
    const byId = new Map(related.map((r) => [String(r.id()), r]))
    for (const record of records) {
      const value = record.get(path)
      if (value == null || value === '') continue
      const found = byId.get(String(value))
      if (found) record.populate(path, found)
    }
  }))
}

const handler = async (
  request: ActionRequest,
  context: ActionContext,
): Promise<ListActionResponse> => {
  const { resource, cacheRuntime, admin } = context
  const query = request.query ?? {}
  const page = Math.max(1, Number(query.page ?? 1))
  const perPage = Math.max(1, Math.min(200, Number(query.perPage ?? DEFAULT_PER_PAGE)))
  const querySortBy = query.sortBy as string | undefined
  const queryDirection = (query.direction as 'asc' | 'desc' | undefined) ?? undefined
  const filters = (query.filters as Record<string, unknown> | undefined) ?? {}

  // When the request doesn't pin a sort, fall back to the resource-level
  // default declared via `ResourceOptions.sort`. Treating it as an effective
  // sort (rather than only forwarding query params) means UI navigation,
  // direct API calls, and cache keys all see the same canonical order.
  const defaultSort = resource.decorate().options.sort
  const sortBy = querySortBy ?? defaultSort?.sortBy
  const direction = querySortBy != null ? queryDirection : defaultSort?.direction

  const filter = new Filter(filters, resource)
  const cacheKey = `list:${resource.id()}:${JSON.stringify({ filters, page, perPage, sortBy, direction })}`
  const cfg = resolveResourceCacheConfig(resource.decorate().options, 'list')

  return cacheRuntime.read<ListActionResponse>(
    cacheKey,
    { enabled: cfg.enabled, ttl: cfg.ttl, tags: [listTag(resource.id())] },
    async () => {
      const sortOption =
        sortBy != null
          ? { sort: { sortBy, ...(direction ? { direction } : {}) } }
          : {}
      const [records, total] = await Promise.all([
        resource.find(filter, { limit: perPage, offset: (page - 1) * perPage, ...sortOption }),
        resource.count(filter),
      ])

      await populateReferences(records, resource, admin)

      return {
        records: records.map((r) => r.toJSON()),
        meta: {
          total,
          page,
          perPage,
          ...(sortBy ? { sortBy } : {}),
          ...(direction ? { direction } : {}),
        },
      }
    },
  )
}

export const listAction: Action<ListActionResponse> = {
  name: 'list',
  actionType: 'resource',
  isAccessible: true,
  isVisible: true,
  component: 'List',
  handler,
}
