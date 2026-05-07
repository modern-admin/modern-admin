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
  const query = (request.params.query ?? '').trim()

  // No query → return first 50 records unfiltered.
  if (!query) {
    const records = await resource.find(new Filter({}, resource), { limit: 50, offset: 0 })
    return { records: records.map((r) => r.toJSON()), meta: { total: records.length, page: 1, perPage: 50 } }
  }

  const seen = new Set<string>()
  const results = []

  // 1. Search by title property (case-insensitive substring via adapter).
  const titleProp = resource.properties().find((p) => p.isTitle())
  if (titleProp) {
    const titleFilter = new Filter({ [titleProp.name()]: query }, resource)
    for (const r of await resource.find(titleFilter, { limit: 50, offset: 0 })) {
      const key = String(r.id())
      if (!seen.has(key)) { seen.add(key); results.push(r) }
    }
  }

  // 2. ID search: exact match via findOne + substring match by scanning a
  //    batch of records. Bypasses the Filter class so it works reliably
  //    across all adapters regardless of how they handle id-field filtering.
  try {
    const byId = await resource.findOne(query)
    if (byId) {
      const key = String(byId.id())
      if (!seen.has(key)) { seen.add(key); results.push(byId) }
    }
  } catch { /* non-numeric id on integer PK — ignore */ }

  // Substring scan: fetch up to 500 records and check whether the id
  // string contains the query. Practical for resources with <500 rows
  // (typical for picker/combobox use-cases); large datasets rely on
  // title search + exact-id match above.
  if (results.length < 50) {
    const batch = await resource.find(new Filter({}, resource), { limit: 500, offset: 0 })
    for (const r of batch) {
      if (String(r.id()).includes(query)) {
        const key = String(r.id())
        if (!seen.has(key)) { seen.add(key); results.push(r) }
      }
    }
  }

  return {
    records: results.map((r) => r.toJSON()),
    meta: { total: results.length, page: 1, perPage: 50 },
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
