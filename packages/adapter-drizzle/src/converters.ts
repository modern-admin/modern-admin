import { and, asc, desc, eq, gte, ilike, inArray, like, lte } from 'drizzle-orm'
import type { Filter, FilterElement, FilterValue, FindOptions } from '@modern-admin/core'
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

const elementToCondition = (
  element: FilterElement,
  table: DrizzleTable,
): unknown => {
  const property = element.property as DrizzleProperty | null
  if (!property) return null
  const column = table[element.path] as DrizzleColumn | undefined
  if (!column) return null
  const { value } = element

  if (Array.isArray(value)) {
    const list = value.map((v) => coerceScalar(v as FilterValue, property)) as unknown[]
    return list.length ? inArray(column as never, list as never) : null
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
  if (property.type() === 'string' && typeof coerced === 'string') {
    // Postgres has ilike; MySQL/SQLite fall back to LIKE.
    const op = (column as DrizzleColumn).columnType?.startsWith('Pg') ? ilike : like
    return op(column as never, `%${coerced}%` as never)
  }
  return eq(column as never, coerced as never)
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
