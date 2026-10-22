import type { ActionContext, ListActionResponse } from '../actions'
import { Filter, type FilterInput, type RawFilters } from './filter.js'
import {
  assertRelationPathAccess,
  invalidRelationFilter,
  resolveRelationPath,
} from './relation-path.js'

const PAGE_SIZE = 200
const MAX_MATCHES = 10_000

/**
 * Resolve relation predicates to scalar IN filters. Every lookup goes through
 * invoke(list), preserving permissions, row-scoping hooks and response redaction.
 * No adapter or transport needs to know the other resources' storage engine.
 */
export async function resolveRelationFilters(
  filter: Filter,
  context: ActionContext,
): Promise<Filter> {
  const { admin, resource, currentAdmin } = context
  const plain = filter.toJSON()
  const groups = new Map<string, Record<string, FilterInput>>()
  for (const [path, criterion] of Object.entries(plain)) {
    if (!filter.isRelationPath(path)) continue
    const entries = resolveRelationPath(resource, path, (id) => admin.findResource(id))
    await assertRelationPathAccess(entries, context, path)
    const separator = path.indexOf('.')
    const head = path.slice(0, separator)
    const group = groups.get(head) ?? {}
    group[path.slice(separator + 1)] = criterion
    groups.set(head, group)
    delete plain[path]
  }

  for (const [head, criteria] of groups) {
    const reference = resource.decorate().getPropertyByKey(head)!.reference()!
    const target = admin.findResource(reference)
    const collectIds = async (filters: RawFilters): Promise<string[]> => {
      const ids = new Set<string>()
      for (let page = 1; ; page++) {
        const response = await admin.invoke<ListActionResponse>(
          {
            params: { resourceId: target.decorate().id, action: 'list' },
            method: 'get',
            query: { filters, page, perPage: PAGE_SIZE },
            // An intermediate read must re-run hooks and read current data.
            refresh: true,
          },
          currentAdmin,
        )
        if (response.meta.total > MAX_MATCHES) {
          throw invalidRelationFilter(head, 'errors:relationFilterTooBroad')
        }
        for (const record of response.records) ids.add(String(record.id))
        if (ids.size > MAX_MATCHES)
          throw invalidRelationFilter(head, 'errors:relationFilterTooBroad')
        if (page * response.meta.perPage >= response.meta.total) break
        if (response.records.length === 0) throw invalidRelationFilter(head)
      }
      return [...ids]
    }

    let ids = await collectIds(criteria)
    // A direct FK predicate and a relational predicate on the same FK are ANDed.
    // Resolve them independently to avoid overwriting either condition.
    if (Object.hasOwn(plain, head)) {
      const idPath = target
        .properties()
        .find((property) => property.isId())
        ?.path()
      if (!idPath) throw invalidRelationFilter(head)
      const direct = filter.get(head)!
      const criterion =
        direct.operator === null
          ? Array.isArray(direct.value)
            ? { operator: 'in' as const, values: direct.value }
            : { operator: 'eq' as const, value: direct.value }
          : plain[head]!
      const allowed = new Set(await collectIds({ [idPath]: criterion }))
      ids = ids.filter((id) => allowed.has(id))
    }
    plain[head] = { operator: 'in', values: ids }
  }
  return new Filter(plain, resource)
}
