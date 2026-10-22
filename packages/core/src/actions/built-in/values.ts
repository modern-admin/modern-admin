import type { Action, ActionRequest, ActionContext, ActionResponse } from '../action.js'
import { Filter } from '../../filter/filter.js'
import { assertRelationPathAccess, resolveRelationPath } from '../../filter/relation-path.js'

export interface ValuesActionResponse extends ActionResponse {
  values: string[]
  hasMore: boolean
}

const DEFAULT_LIMIT = 100

const handler = async (
  request: ActionRequest,
  context: ActionContext,
): Promise<ValuesActionResponse> => {
  const { resource } = context
  const query = request.query ?? {}
  const field = (query.field as string | undefined) ?? ''
  const search = (query.search as string | undefined) ?? ''
  const limit = Math.max(1, Math.min(1000, Number(query.limit ?? DEFAULT_LIMIT)))

  if (!field) {
    return { values: [], hasMore: false }
  }

  if (new Filter({}, resource).isRelationPath(field)) {
    const entries = resolveRelationPath(resource, field, (id) => context.admin.findResource(id))
    await assertRelationPathAccess(entries, context, field)
    const terminal = entries.at(-1)!
    return context.admin.invoke<ValuesActionResponse>(
      {
        params: { resourceId: terminal.resource.decorate().id, action: 'values' },
        method: 'get',
        query: { ...query, field: terminal.property.path() },
      },
      context.currentAdmin,
    )
  }

  const property = resource.property(field)
  if (!property) {
    return { values: [], hasMore: false }
  }

  // Ask the adapter for distinct values. Adapters that don't implement
  // this return an empty array, gracefully degrading to a text input.
  const values = await resource.distinct(field, { limit: limit + 1, search })
  const hasMore = values.length > limit
  if (hasMore) values.pop()

  return { values, hasMore }
}

export const valuesAction: Action<ValuesActionResponse> = {
  name: 'values',
  actionType: 'resource',
  isAccessible: true,
  isVisible: false, // not a user-facing action
  handler,
}
