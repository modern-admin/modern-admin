import { Filter } from '../../filter/filter.js'
import type { BaseRecord } from '../../adapters'
import type { PropertyDecorator } from '../../decorators/property-decorator.js'
import { listTag } from '../cache-runtime.js'
import { resolveResourceCacheConfig } from '../../decorators/cache-config.js'
import type {
  Action,
  ActionContext,
  ActionRequest,
  ListActionResponse,
} from '../action.js'

/**
 * Collect the list of property paths to search across.
 *
 * Rules (tri-state per property via `PropertyOptions.isSearchable`):
 *  - `true`     → always included, regardless of type/visibility.
 *  - `false`    → always skipped.
 *  - `undefined`→ auto: include if visible, non-id, type === 'string'.
 *
 * The resolved title property (`ResourceOptions.titleProperty` or the
 * `TITLE_COLUMN_NAMES` heuristic) is always searched first so title hits
 * outrank arbitrary-column hits in the natural traversal order.
 */
const collectSearchableFields = (
  context: ActionContext,
): { titlePath: string | null; fields: string[] } => {
  const { resource } = context
  const decorator = resource._decorated ?? null
  const titlePath = resource.titlePropertyPath()
  const seen = new Set<string>()
  const fields: string[] = []
  const push = (path: string): void => {
    if (seen.has(path)) return
    seen.add(path)
    fields.push(path)
  }
  if (titlePath) push(titlePath)

  const decorators: ReadonlyArray<PropertyDecorator> | null =
    decorator?.properties ?? null

  if (decorators) {
    for (const prop of decorators) {
      const flag = prop.isSearchable()
      if (flag === false) {
        if (prop.path() === titlePath) {
          // Explicit opt-out wins even over the title heuristic.
          seen.delete(titlePath)
          fields.shift()
        }
        continue
      }
      if (flag === true) {
        push(prop.path())
        continue
      }
      // Auto: visible, non-id, string columns.
      if (prop.isId()) continue
      if (String(prop.type()) !== 'string') continue
      if (!prop.isVisibleIn('list') && !prop.isVisibleIn('show')) continue
      push(prop.path())
    }
  } else {
    // No decorator yet (e.g. plain unit-tested resource) — fall back to
    // BaseProperty inspection so the action stays functional.
    for (const prop of resource.properties()) {
      if (prop.isId()) continue
      if (prop.type() !== 'string') continue
      if (!prop.isVisible()) continue
      push(prop.path())
    }
  }
  return { titlePath, fields }
}

/**
 * Score a record against the query so the most relevant hits float to the
 * top. Higher score = better match.
 *
 *   1000 — exact id match
 *    900 — exact title match (case-insensitive)
 *    700 — title starts with the query
 *    500 — title contains the query
 *    300 — any other searched field contains the query
 *      0 — fallback (id substring or insertion order tie-breaker)
 */
const scoreRecord = (
  record: BaseRecord,
  query: string,
  titlePath: string | null,
  fields: string[],
): number => {
  const q = query.toLowerCase()
  const idStr = String(record.id()).toLowerCase()
  if (idStr === q) return 1000

  if (titlePath) {
    const title = String(record.get(titlePath) ?? '').toLowerCase()
    if (title && title === q) return 900
    if (title && title.startsWith(q)) return 700
    if (title && title.includes(q)) return 500
  }
  for (const field of fields) {
    if (field === titlePath) continue
    const value = String(record.get(field) ?? '').toLowerCase()
    if (value && value.includes(q)) return 300
  }
  if (idStr.includes(q)) return 100
  return 0
}

const RESULT_LIMIT = 50
const FETCH_MULTIPLIER = 2

const handler = async (
  request: ActionRequest,
  context: ActionContext,
): Promise<ListActionResponse> => {
  const { resource, cacheRuntime } = context
  const query = (request.params.query ?? '').trim()

  // No query → return first 50 records unfiltered.
  if (!query) {
    const records = await resource.find(new Filter({}, resource), { limit: RESULT_LIMIT, offset: 0 })
    return {
      records: records.map((r) => r.toJSON()),
      meta: { total: records.length, page: 1, perPage: RESULT_LIMIT },
    }
  }

  const cacheKey = `search:${resource.id()}:${query}`
  const cfg = resolveResourceCacheConfig(resource.decorate().options, 'search')

  return cacheRuntime.read<ListActionResponse>(
    cacheKey,
    {
      enabled: cfg.enabled,
      ttl: cfg.ttl,
      tags: [listTag(resource.id())],
    },
    async () => {
      const { titlePath, fields } = collectSearchableFields(context)
      const seen = new Set<string>()
      const collected: BaseRecord[] = []
      const add = (record: BaseRecord): void => {
        const key = String(record.id())
        if (seen.has(key)) return
        seen.add(key)
        collected.push(record)
      }

      // 1. Exact id match (and dependent-typed ids handled via try/catch).
      try {
        const byId = await resource.findOne(query)
        if (byId) add(byId)
      } catch { /* non-numeric id on integer PK — ignore */ }

      // 2. Field-wide substring search via the adapter-overridable hook.
      //    Adapters with native OR build one query; the default impl fans out.
      if (fields.length > 0) {
        const fanned = await resource.search(query, fields, {
          limit: RESULT_LIMIT * FETCH_MULTIPLIER,
        })
        for (const record of fanned) add(record)
      }

      // 3. ID substring fallback. Only when steps 1–2 turned up *nothing* —
      //    an exact-id hit or any field match means the query is being used
      //    as a normal search, so we skip the bounded (≤200-row) scan. When
      //    there are no matches we scan and keep records whose id stringifies
      //    to something containing the query. Practical for UUID/cuid pickers
      //    where operators paste the trailing segment of a record id.
      if (collected.length === 0) {
        const batch = await resource.find(new Filter({}, resource), {
          limit: 200,
          offset: 0,
        })
        for (const record of batch) {
          if (String(record.id()).toLowerCase().includes(query.toLowerCase())) {
            add(record)
            if (collected.length >= RESULT_LIMIT) break
          }
        }
      }

      // 4. Rank, then trim.
      const ranked = collected
        .map((record, index) => ({
          record,
          score: scoreRecord(record, query, titlePath, fields),
          index,
        }))
        .sort((a, b) => (b.score - a.score) || (a.index - b.index))
        .slice(0, RESULT_LIMIT)
        .map((entry) => entry.record)

      return {
        records: ranked.map((r) => r.toJSON()),
        meta: { total: ranked.length, page: 1, perPage: RESULT_LIMIT },
      }
    },
  )
}

export const searchAction: Action<ListActionResponse> = {
  name: 'search',
  actionType: 'resource',
  isAccessible: true,
  isVisible: false,
  component: null,
  handler,
}
