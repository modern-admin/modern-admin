import type { Filter, FilterElement, FilterValue } from '@modern-admin/core'
import type { FindOptions } from '@modern-admin/core'
import type { PrismaProperty } from './property.js'

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

const buildClause = (element: FilterElement): unknown => {
  const property = element.property as PrismaProperty | null
  const { value } = element

  if (Array.isArray(value)) return { in: value.map((v) => coerceScalar(v as FilterValue, property)) }

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
  if (property && property.type() === 'string' && typeof coerced === 'string') {
    return { contains: coerced, mode: 'insensitive' }
  }
  return { equals: coerced }
}

/**
 * Convert a core Filter into a Prisma `where` object. Skips elements with no
 * matching property to avoid generating queries against unknown columns.
 */
export const filterToWhere = (filter: Filter): Record<string, unknown> => {
  const where: Record<string, unknown> = {}
  filter.reduce<null>((_, element) => {
    if (!element.property) return null
    const clause = buildClause(element)
    if (clause !== undefined) where[element.path] = clause
    return null
  }, null)
  return where
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
