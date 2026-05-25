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
  const isArray = property?.isArray() ?? false

  // ── Scalar-list (e.g. `String[]`, `Int[]`) field semantics ──────────
  // Most scalar operators translate to element-wise list operators or are
  // not supported by Prisma. Surface what we can; drop the rest so the
  // adapter never produces an invalid where clause.
  if (isArray) {
    switch (operator) {
      case 'eq':
        return { has: coerceScalar(value, property) }
      case 'in': {
        if (Array.isArray(value)) {
          const list = value.map((v) => coerceScalar(v as FilterValue, property))
          // Empty selection ⇒ "no filter" (see scalar branch below).
          if (!list.length) return undefined
          return { hasSome: list }
        }
        return { hasSome: [coerceScalar(value, property)] }
      }
      // `co`/`sw`/`ew`/`gt`/`lt`/`between`/`neq` have no list equivalent
      // in Prisma. Dropping the clause is preferable to a 500.
      default:
        return undefined
    }
  }

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
      // `contains`/`startsWith`/`endsWith` are only valid on string columns.
      // Drop the clause on non-string fields instead of emitting an invalid
      // where that crashes Prisma.
      if (!isString) return undefined
      const coerced = coerceScalar(value, property)
      return { contains: String(coerced), mode: 'insensitive' }
    }
    case 'sw': {
      if (!isString) return undefined
      const coerced = coerceScalar(value, property)
      return { startsWith: String(coerced), mode: 'insensitive' }
    }
    case 'ew': {
      if (!isString) return undefined
      const coerced = coerceScalar(value, property)
      return { endsWith: String(coerced), mode: 'insensitive' }
    }
    case 'in': {
      if (Array.isArray(value)) {
        const list = value.map((v) => coerceScalar(v as FilterValue, property))
        // Empty selection ⇒ "no filter applied", matching the Drizzle
        // adapter. Without this guard Prisma executes `{ in: [] }` as
        // "match nothing", which surprised users who unchecked the last
        // item in the "Is one of" picker and expected the full list back.
        if (!list.length) return undefined
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
      if (toStr) {
        const upper = coerceScalar(toStr, property)
        // For date-only `yyyy-MM-dd` upper bounds on DateTime columns the
        // raw `new Date('2025-12-31')` lands at midnight UTC — excluding
        // everything timestamped later that day. Bump to end-of-day so the
        // user-visible "to 2025-12-31" actually includes 2025-12-31.
        if (
          upper instanceof Date &&
          /^\d{4}-\d{2}-\d{2}$/.test(toStr) &&
          (property?.type() === 'date' || property?.type() === 'datetime')
        ) {
          clause.lte = new Date(upper.getTime() + 24 * 60 * 60 * 1000 - 1)
        } else {
          clause.lte = upper
        }
      }
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

    const isArray = property?.isArray() ?? false

    // ── Operators that need top-level WHERE clauses ──────────────────
    if (operator === 'empty') {
      if (isArray) {
        // Prisma's only valid empty-check for scalar lists; `null` is
        // rejected because list columns are non-nullable in Postgres.
        where[path] = { isEmpty: true }
      } else if (isString) {
        topLevel.push({ OR: [{ [path]: null }, { [path]: '' }] })
      } else {
        topLevel.push({ [path]: null })
      }
      return null
    }
    if (operator === 'nempty') {
      if (isArray) {
        where[path] = { isEmpty: false }
        return null
      }
      topLevel.push({ NOT: { [path]: null } })
      if (isString) topLevel.push({ NOT: { [path]: '' } })
      return null
    }
    if (operator === 'nco') {
      // `contains` is only defined on string columns; drop silently on
      // anything else so the request never 500s.
      if (!isString) return null
      const coerced = coerceScalar(value, property)
      topLevel.push({ NOT: { [path]: { contains: String(coerced), mode: 'insensitive' } } })
      return null
    }

    // ── Field-level clause ──────────────────────────────────────────
    // Relation (object-kind) fields don't support scalar operators like
    // `equals`. Translate a scalar value to {is: {relatedId: {equals: v}}}.
    if (property instanceof PrismaProperty && property.field.kind === 'object') {
      const relatedIdField = property.field.relationToFields?.[0] ?? 'id'
      // Drop empty strings — typically arrive when the user clears a
      // reference picker. `{equals: ''}` would otherwise crash on
      // UUID/Int FK columns.
      if (value == null || value === '') return null

      if (typeof value === 'object' && !Array.isArray(value)) {
        // Nested object value (e.g. `filters[author.name]=Alice` → Filter
        // unflattens to `{author: {name: 'Alice'}}`). Recurse: emit
        // `{is: {name: {contains: 'Alice', mode: 'insensitive'}}}`.
        const inner: Record<string, unknown> = {}
        for (const [innerKey, innerValue] of Object.entries(value as Record<string, unknown>)) {
          if (innerValue == null || innerValue === '') continue
          inner[innerKey] = typeof innerValue === 'string'
            ? { contains: innerValue, mode: 'insensitive' }
            : { equals: innerValue }
        }
        if (Object.keys(inner).length === 0) return null
        where[path] = { is: inner }
        return null
      }

      const coerced = coerceScalar(value as FilterValue, null)
      if (coerced != null && coerced !== '') {
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
