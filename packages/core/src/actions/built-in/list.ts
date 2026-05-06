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
  const sortBy = query.sortBy as string | undefined
  const direction = (query.direction as 'asc' | 'desc' | undefined) ?? undefined
  const filters = (query.filters as Record<string, unknown> | undefined) ?? {}

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
