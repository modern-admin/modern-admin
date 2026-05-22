import type { Filter, FilterElement, FilterOperator, FilterValue } from '@modern-admin/core'
import type { FindOptions } from '@modern-admin/core'
import { PrismaProperty } from './property.js'

const isRangeValue = (
  value: FilterValue,
): value is { from?: string; to?: string } =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const coerceScalar = (
  value: FilterValue,
  property: PrismaProperty | null,
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

/**
 * Build the Prisma `where` clause for a single filter element.
 *
 * When an explicit `operator` is set, it takes precedence over legacy
 * implicit behaviour. All string operations use `mode: 'insensitive'`
 * for case-insensitive matching (supported by Prisma on PostgreSQL and MongoDB).
 */
const buildClause = (element: FilterElement): unknown => {
  const property = element.property as PrismaProperty | null
  const { value, operator } = element

  // ── Explicit operator ────────────────────────────────────────────────
  if (operator) {
    return buildOperatorClause(operator, value, property)
  }

  // ── Legacy implicit behaviour (backward compat) ──────────────────────
  if (Array.isArray(value)) {
    const list = value.map((v) => coerceScalar(v as FilterValue, property))
    if (property?.isArray()) return { hasSome: list }
    return { in: list }
  }

  if (isRangeValue(value)) {
    const clause: Record<string, unknown> = {}
    if (value.from !== undefined && value.from !== '') {
      clause.gte = coerceScalar(value.from, property)
    }
    if (value.to !== undefined && value.to !== '') {
      clause.lte = coerceScalar(value.to, property)
    }
    return Object.keys(clause).length ? clause : undefined
  }

  const coerced = coerceScalar(value, property)
  if (property?.isArray()) return { has: coerced }
  if (property && property.type() === 'string' && typeof coerced === 'string') {
    return { contains: coerced, mode: 'insensitive' }
  }
  return { equals: coerced }
}

/**
 * Translate an explicit FilterOperator to a Prisma **field-level** where clause.
 * String comparisons are case-insensitive via `mode: 'insensitive'`.
 *
 * NOTE: `empty`, `nempty` and `nco` require top-level WHERE clauses (OR / NOT)
 * and are handled directly in {@link filterToWhere}. They never reach here.
 */
const buildOperatorClause = (
  operator: FilterOperator,
  value: FilterValue,
  property: PrismaProperty | null,
): unknown => {
  const isString = property != null && property.type() === 'string'

  switch (operator) {
    case 'eq': {
      const coerced = coerceScalar(value, property)
      if (isString && typeof coerced === 'string') {
        return { equals: coerced, mode: 'insensitive' }
      }
      return { equals: coerced }
    }
    case 'neq': {
      const coerced = coerceScalar(value, property)
      if (isString && typeof coerced === 'string') {
        // `notIn` + `mode` is valid at field level; `not: { equals, mode }` is NOT
        // because NestedStringFilter has no `mode`.
        return { notIn: [coerced], mode: 'insensitive' }
      }
      return { not: coerced }
    }
    case 'co': {
      const coerced = coerceScalar(value, property)
      if (typeof coerced === 'string') {
        return { contains: coerced, mode: 'insensitive' }
      }
      return { contains: coerced }
    }
    case 'sw': {
      const coerced = coerceScalar(value, property)
      if (typeof coerced === 'string') {
        return { startsWith: coerced, mode: 'insensitive' }
      }
      return { startsWith: coerced }
    }
    case 'ew': {
      const coerced = coerceScalar(value, property)
      if (typeof coerced === 'string') {
        return { endsWith: coerced, mode: 'insensitive' }
      }
      return { endsWith: coerced }
    }
    case 'in': {
      if (Array.isArray(value)) {
        const list = value.map((v) => coerceScalar(v as FilterValue, property))
        if (property?.isArray()) return { hasSome: list }
        return { in: list }
      }
      // Single string passed for `in` — coerce to single-element array
      const coerced = coerceScalar(value, property)
      return { in: [coerced] }
    }
    case 'gt': {
      const coerced = coerceScalar(value, property)
      return { gt: coerced }
    }
    case 'lt': {
      const coerced = coerceScalar(value, property)
      return { lt: coerced }
    }
    case 'between': {
      const str = typeof value === 'string' ? value : ''
      const comma = str.indexOf(',')
      const fromStr = comma >= 0 ? str.slice(0, comma) : str
      const toStr = comma >= 0 ? str.slice(comma + 1) : ''
      const clause: Record<string, unknown> = {}
      if (fromStr) clause.gte = coerceScalar(fromStr, property)
      if (toStr) clause.lte = coerceScalar(toStr, property)
      return Object.keys(clause).length ? clause : undefined
    }
    default:
      return undefined
  }
}

/**
 * Convert a core Filter into a Prisma `where` object. Skips elements with no
 * matching property to avoid generating queries against unknown columns.
 *
 * Some operators (`empty`, `nempty`, `nco`) require top-level `OR` / `NOT`
 * clauses because Prisma only allows these at the `where` root — not inside
 * a field-level filter. These are collected separately and merged via `AND`.
 */
export const filterToWhere = (filter: Filter): Record<string, unknown> => {
  const where: Record<string, unknown> = {}
  const topLevel: unknown[] = []

  filter.reduce<null>((_, element) => {
    if (!element.property) return null
    const { path, operator, value } = element
    const property = element.property as PrismaProperty | null
    const isString = property != null && property.type() === 'string'

    // ── Operators that need top-level WHERE clauses ──────────────────
    if (operator === 'empty') {
      if (isString) {
        topLevel.push({ OR: [{ [path]: null }, { [path]: '' }] })
      } else {
        topLevel.push({ [path]: null })
      }
      return null
    }
    if (operator === 'nempty') {
      topLevel.push({ NOT: { [path]: null } })
      if (isString) topLevel.push({ NOT: { [path]: '' } })
      return null
    }
    if (operator === 'nco') {
      const coerced = coerceScalar(value, property)
      if (typeof coerced === 'string') {
        topLevel.push({ NOT: { [path]: { contains: coerced, mode: 'insensitive' } } })
      } else {
        topLevel.push({ NOT: { [path]: { contains: coerced } } })
      }
      return null
    }

    // ── Field-level clause ──────────────────────────────────────────
    // Relation (object-kind) fields don't support scalar operators like
    // `equals`. Translate a scalar value to {is: {relatedId: {equals: v}}}.
    if (property instanceof PrismaProperty && property.field.kind === 'object') {
      const relatedIdField = property.field.relationToFields?.[0] ?? 'id'
      const coerced = coerceScalar(value as FilterValue, null)
      if (coerced != null) {
        where[path] = { is: { [relatedIdField]: { equals: coerced } } }
      }
      return null
    }

    const clause = buildClause(element)
    if (clause !== undefined) where[path] = clause
    return null
  }, null)

  if (topLevel.length === 0) return where
  return { AND: [where, ...topLevel] }
}

export const findOptionsToPrisma = (
  options: FindOptions,
): { take?: number; skip?: number; orderBy?: Record<string, 'asc' | 'desc'> } => {
  const out: { take?: number; skip?: number; orderBy?: Record<string, 'asc' | 'desc'> } = {}
  if (options.limit != null) out.take = options.limit
  if (options.offset != null) out.skip = options.offset
  if (options.sort?.sortBy) {
    out.orderBy = { [options.sort.sortBy]: options.sort.direction ?? 'asc' }
  }
  return out
}
