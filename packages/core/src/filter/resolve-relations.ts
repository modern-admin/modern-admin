import type { ActionContext, ActionRequest, ListActionResponse } from '../actions'
import { stableCacheStringify } from '../actions/cache-keys.js'
import { Filter, type FilterInput, type RawFilters } from './filter.js'
import {
  assertRelationPathAccess,
  invalidRelationFilter,
  resolveRelationPath,
} from './relation-path.js'

const PAGE_SIZE = 200
const MAX_MATCHES = 10_000

interface RelationFilterScope {
  matches: Map<string, Promise<string[]>>
}

const relationFilterScope = Symbol('relationFilterScope')
type ScopedRequest = ActionRequest & { [relationFilterScope]?: RelationFilterScope }
const invocationScopes = new WeakMap<ActionContext, RelationFilterScope>()

/** @internal Keep lookup memoization inside one invoke tree, outside wire metadata. */
export function bindRelationFilterScope(request: ActionRequest, context: ActionContext): void {
  invocationScopes.set(
    context,
    (request as ScopedRequest)[relationFilterScope] ?? { matches: new Map() },
  )
}

/**
 * Resolve relation predicates to scalar IN filters. Every lookup goes through
 * invoke(list), preserving permissions, row-scoping hooks and response redaction.
 * No adapter or transport needs to know the other resources' storage engine.
 */
export async function resolveRelationFilters(
  filter: Filter,
  context: ActionContext,
): Promise<Filter | null> {
  if (!filter.hasRelations()) return filter
  const { admin, resource, currentAdmin } = context
  const scope = invocationScopes.get(context) ?? { matches: new Map<string, Promise<string[]>>() }
  invocationScopes.set(context, scope)
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
    const property = resource.decorate().getPropertyByKey(head)!
    const reference = property.reference()!
    const target = admin.findResource(reference)
    const idPath = target
      .properties()
      .find((property) => property.isId())
      ?.path()
    const keyPath = property.property.referenceFields()?.[0] ?? idPath
    if (!keyPath) throw invalidRelationFilter(head)
    const readIds = async (filters: RawFilters): Promise<string[]> => {
      const ids = new Set<string>()
      for (let page = 1; ; page++) {
        const request: ScopedRequest = {
          params: { resourceId: target.decorate().id, action: 'list' },
          method: 'get',
          query: { filters, page, perPage: PAGE_SIZE },
          // An intermediate read must re-run hooks and read current data.
          refresh: true,
          [relationFilterScope]: scope,
        }
        const response = await admin.invoke<ListActionResponse>(request, currentAdmin)
        if (response.meta.total > MAX_MATCHES) {
          throw invalidRelationFilter(head, 'errors:relationFilterTooBroad')
        }
        for (const record of response.records) {
          const value = keyPath === idPath ? record.id : record.params[keyPath]
          // A nullable unique key cannot match any source foreign key.
          if (value === null) continue
          if (value === undefined || !['string', 'number', 'boolean'].includes(typeof value)) {
            throw invalidRelationFilter(head)
          }
          ids.add(String(value))
        }
        if (ids.size > MAX_MATCHES)
          throw invalidRelationFilter(head, 'errors:relationFilterTooBroad')
        if (page * response.meta.perPage >= response.meta.total) break
        if (response.records.length === 0) throw invalidRelationFilter(head)
      }
      return [...ids]
    }
    const collectIds = (filters: RawFilters): Promise<string[]> => {
      const key = stableCacheStringify([target.decorate().id, keyPath, filters])
      let pending = scope.matches.get(key)
      if (!pending) {
        pending = readIds(filters)
        scope.matches.set(key, pending)
      }
      return pending
    }

    let ids = await collectIds(criteria)
    if (ids.length === 0) return null
    // A direct FK predicate and a relational predicate on the same FK are ANDed.
    // Resolve them independently to avoid overwriting either condition.
    if (Object.hasOwn(plain, head)) {
      const direct = filter.get(head)!
      const criterion =
        direct.operator === null
          ? Array.isArray(direct.value)
            ? { operator: 'in' as const, values: direct.value }
            : { operator: 'eq' as const, value: direct.value }
          : plain[head]!
      const allowed = new Set(await collectIds({ [keyPath]: criterion }))
      ids = ids.filter((id) => allowed.has(id))
    }
    // Adapters may treat an empty IN selection as a cleared UI filter.
    // Short-circuit the list instead of sending that ambiguous value to storage.
    if (ids.length === 0) return null
    plain[head] = { operator: 'in', values: ids }
  }
  return new Filter(plain, resource)
}
