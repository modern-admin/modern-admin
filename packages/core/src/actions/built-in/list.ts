import { Filter } from '../../filter/filter.js'
import type { Action, ActionRequest, ActionContext, ListActionResponse } from '../action.js'

const DEFAULT_PER_PAGE = 20

const handler = async (
  request: ActionRequest,
  context: ActionContext,
): Promise<ListActionResponse> => {
  const { resource, cache } = context
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

  const cached = await cache.get<ListActionResponse>(cacheKey)
  if (cached) return cached

  const sortOption =
    sortBy != null
      ? { sort: { sortBy, ...(direction ? { direction } : {}) } }
      : {}
  const [records, total] = await Promise.all([
    resource.find(filter, { limit: perPage, offset: (page - 1) * perPage, ...sortOption }),
    resource.count(filter),
  ])

  const response: ListActionResponse = {
    records: records.map((r) => r.toJSON()),
    meta: {
      total,
      page,
      perPage,
      ...(sortBy ? { sortBy } : {}),
      ...(direction ? { direction } : {}),
    },
  }
  await cache.set(cacheKey, response, {
    ttl: 30,
    tags: [`resource:${resource.id()}`],
  })
  return response
}

export const listAction: Action<ListActionResponse> = {
  name: 'list',
  actionType: 'resource',
  isAccessible: true,
  isVisible: true,
  component: 'List',
  handler,
}
