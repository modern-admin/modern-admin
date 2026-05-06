import { Filter } from '../../filter/filter.js'
import type {
  Action,
  ActionContext,
  ActionRequest,
  ListActionResponse,
} from '../action.js'

const handler = async (
  request: ActionRequest,
  context: ActionContext,
): Promise<ListActionResponse> => {
  const { resource } = context
  const query = request.params.query ?? ''
  const titleProp = resource.properties().find((p) => p.isTitle())
  const filters = titleProp && query
    ? { [titleProp.name()]: query }
    : {}
  const filter = new Filter(filters, resource)
  const records = await resource.find(filter, { limit: 50, offset: 0 })
  return {
    records: records.map((r) => r.toJSON()),
    meta: { total: records.length, page: 1, perPage: 50 },
  }
}

export const searchAction: Action<ListActionResponse> = {
  name: 'search',
  actionType: 'resource',
  isAccessible: true,
  isVisible: false,
  component: null,
  handler,
}
