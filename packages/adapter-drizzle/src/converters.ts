import { and, arrayContains, arrayOverlaps, asc, desc, eq, gt, gte, ilike, inArray, isNotNull, isNull, like, lt, lte, ne, not, or } from 'drizzle-orm'
import type { Filter, FilterElement, FilterOperator, FilterValue, FindOptions } from '@modern-admin/core'
import type { DrizzleProperty } from './property.js'
import type { DrizzleColumn, DrizzleTable } from './types.js'

const isRangeValue = (
  value: FilterValue,
): value is { from?: string; to?: string } =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const coerceScalar = (
  value: FilterValue,
  property: DrizzleProperty | null,
): unknown => {
  if (value == null || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map((v) => coerceScalar(v as FilterValue, property))
  if (typeof value === 'number') return value
  if (typeof value !== 'string') return value
  if (!property) return value
  switch (property.type()) {
    case 'number':
    case 'currency': {
      const n = Number(value)
      return Number.isFinite(n) ? n : value
    }
    case 'float': {
      const n = parseFloat(value)
      return Number.isFinite(n) ? n : value
    }
    case 'boolean':
      return value === 'true' || value === '1'
    case 'date':
    case 'datetime': {
      const d = new Date(value)
      return Number.isNaN(d.getTime()) ? value : d
    }
    default:
      return value
  }
}

/** Return the case-insensitive `like` function appropriate for the dialect. */
const ciLike = (column: DrizzleColumn) =>
  (column as DrizzleColumn).columnType?.startsWith('Pg') ? ilike : like

/**
 * Wrap a value in `%...%` for a LIKE/ILIKE contains match.
 * The `%` characters within the user value are escaped so they match literally.
 */
const likeContains = (v: string) => `%${v}%`
const likeStartsWith = (v: string) => `${v}%`
const likeEndsWith = (v: string) => `%${v}`

/**
 * Build a drizzle condition for a single filter element.
 * When an explicit `operator` is set, it takes precedence over legacy implicit
 * behaviour. All string comparisons use `ilike` (Postgres) / `like` (others)
 * for case-insensitive matching.
 */
const elementToCondition = (
  element: FilterElement,
  table: DrizzleTable,
): unknown => {
  const property = element.property as DrizzleProperty | null
  if (!property) return null
  const column = table[element.path] as DrizzleColumn | undefined
  if (!column) return null
  const { value, operator } = element

  // ── Explicit operator ────────────────────────────────────────────────
  if (operator) {
    return buildOperatorCondition(operator, value, property, column)
  }

  // ── Legacy implicit behaviour (backward compat) ──────────────────────
  if (Array.isArray(value)) {
    const list = value.map((v) => coerceScalar(v as FilterValue, property)) as unknown[]
    if (!list.length) return null
    if (property.isArray()) return arrayOverlaps(column as never, list as never)
    return inArray(column as never, list as never)
  }

  if (isRangeValue(value)) {
    const conds: unknown[] = []
    if (value.from !== undefined && value.from !== '') {
      conds.push(gte(column as never, coerceScalar(value.from, property) as never))
    }
    if (value.to !== undefined && value.to !== '') {
      conds.push(lte(column as never, coerceScalar(value.to, property) as never))
    }
    if (!conds.length) return null
    return conds.length === 1 ? conds[0] : and(...(conds as never[]))
  }

  const coerced = coerceScalar(value, property)
  if (property.isArray()) {
    return arrayContains(column as never, [coerced] as never)
  }
  if (property.type() === 'string' && typeof coerced === 'string') {
    const op = ciLike(column)
    return op(column as never, likeContains(coerced) as never)
  }
  return eq(column as never, coerced as never)
}

/**
 * Translate an explicit FilterOperator to a drizzle SQL condition.
 * String comparisons use `ilike` (PG) / `like` (others).
 */
const buildOperatorCondition = (
  operator: FilterOperator,
  value: FilterValue,
  property: DrizzleProperty,
  column: DrizzleColumn,
): unknown => {
  const isString = property.type() === 'string'

  switch (operator) {
    case 'eq': {
      const coerced = coerceScalar(value, property)
      if (isString && typeof coerced === 'string') {
        const op = ciLike(column)
        // Exact match via ILIKE without wildcards (case-insensitive equals)
        return op(column as never, coerced as never)
      }
      return eq(column as never, coerced as never)
    }
    case 'neq': {
      const coerced = coerceScalar(value, property)
      if (isString && typeof coerced === 'string') {
        const op = ciLike(column)
        return not(op(column as never, coerced as never))
      }
      return ne(column as never, coerced as never)
    }
    case 'co': {
      const coerced = coerceScalar(value, property)
      if (typeof coerced === 'string') {
        const op = ciLike(column)
        return op(column as never, likeContains(coerced) as never)
      }
      return eq(column as never, coerced as never)
    }
    case 'nco': {
      const coerced = coerceScalar(value, property)
      if (typeof coerced === 'string') {
        const op = ciLike(column)
        return not(op(column as never, likeContains(coerced) as never))
      }
      return ne(column as never, coerced as never)
    }
    case 'sw': {
      const coerced = coerceScalar(value, property)
      if (typeof coerced === 'string') {
        const op = ciLike(column)
        return op(column as never, likeStartsWith(coerced) as never)
      }
      return eq(column as never, coerced as never)
    }
    case 'ew': {
      const coerced = coerceScalar(value, property)
      if (typeof coerced === 'string') {
        const op = ciLike(column)
        return op(column as never, likeEndsWith(coerced) as never)
      }
      return eq(column as never, coerced as never)
    }
    case 'empty':
      return or(
        isNull(column as never),
        eq(column as never, '' as never),
      )
    case 'nempty':
      return and(
        isNotNull(column as never),
        ne(column as never, '' as never),
      )
    case 'in': {
      if (Array.isArray(value)) {
        const list = value.map((v) => coerceScalar(v as FilterValue, property)) as unknown[]
        if (!list.length) return null
        if (property.isArray()) return arrayOverlaps(column as never, list as never)
        return inArray(column as never, list as never)
      }
      const coerced = coerceScalar(value, property)
      return eq(column as never, coerced as never)
    }
    case 'gt': {
      const coerced = coerceScalar(value, property)
      return gt(column as never, coerced as never)
    }
    case 'lt': {
      const coerced = coerceScalar(value, property)
      return lt(column as never, coerced as never)
    }
    case 'between': {
      const str = typeof value === 'string' ? value : ''
      const comma = str.indexOf(',')
      const fromStr = comma >= 0 ? str.slice(0, comma) : str
      const toStr = comma >= 0 ? str.slice(comma + 1) : ''
      const conds: unknown[] = []
      if (fromStr) conds.push(gte(column as never, coerceScalar(fromStr, property) as never))
      if (toStr) conds.push(lte(column as never, coerceScalar(toStr, property) as never))
      if (!conds.length) return null
      return conds.length === 1 ? conds[0] : and(...(conds as never[]))
    }
    default:
      return null
  }
}

/**
 * Convert a core Filter into a drizzle `where` SQL condition. Returns
 * `undefined` when no usable filter was provided so the caller can omit
 * `.where()` entirely.
 */
export const filterToWhere = (
  filter: Filter,
  table: DrizzleTable,
): unknown => {
  const conditions: unknown[] = []
  filter.reduce<null>((_, element) => {
    const cond = elementToCondition(element, table)
    if (cond != null) conditions.push(cond)
    return null
  }, null)
  if (conditions.length === 0) return undefined
  if (conditions.length === 1) return conditions[0]
  return and(...(conditions as never[]))
}

export interface DrizzleFindShape {
  where: unknown
  limit?: number
  offset?: number
  orderBy?: unknown
}

export const findOptionsToDrizzle = (
  options: FindOptions,
  table: DrizzleTable,
): Pick<DrizzleFindShape, 'limit' | 'offset' | 'orderBy'> => {
  const out: Pick<DrizzleFindShape, 'limit' | 'offset' | 'orderBy'> = {}
  if (options.limit != null) out.limit = options.limit
  if (options.offset != null) out.offset = options.offset
  const sortBy = options.sort?.sortBy
  if (sortBy) {
    const column = table[sortBy] as DrizzleColumn | undefined
    if (column) {
      out.orderBy = (options.sort?.direction === 'desc' ? desc : asc)(column as never)
    }
  }
  return out
}
