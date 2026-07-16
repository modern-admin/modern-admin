// Shared filter-value helpers for ORM adapters.
//
// The Prisma and Drizzle adapters translate a core `Filter` into their own
// `where` shapes (plain objects vs. drizzle-orm SQL builders), so the clause
// *construction* is adapter-specific. The value *normalisation* that feeds it —
// coercing form-encoded strings to the property's declared scalar type,
// recognising a `{ from, to }` range object, and splitting a `between`
// `"a,b"` string — is identical between them and lives here.

import type { BaseProperty } from './base-property.js'
import type { PropertyType } from './types.js'
import type { FilterValue } from '../filter/filter.js'

/** A property-ish object exposing just the `type()` needed to coerce a value. */
export interface CoercibleProperty {
  type(): PropertyType
}

/**
 * A filter value is a range when it's a non-array object — i.e. the
 * `{ from?, to? }` shape produced by range/date pickers.
 */
export const isRangeValue = (
  value: FilterValue,
): value is { from?: string; to?: string } =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Coerce a filter value to the scalar type declared by its property. Form
 * transports stringify every value, so numbers/booleans/dates arrive as
 * strings; this maps them back so the adapter emits a correctly-typed clause.
 * Unparseable strings pass through unchanged. `null`/`boolean`/`number` and
 * values with no property are returned as-is; arrays coerce element-wise.
 */
export const coerceScalar = (
  value: FilterValue,
  property: CoercibleProperty | null,
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
 * Split a `between` filter value (`"from,to"`) into its two raw string bounds.
 * A missing comma treats the whole value as the lower bound. Each side is
 * coerced by the caller (which owns the property-specific end-of-day handling).
 */
export const parseBetween = (value: FilterValue): { fromStr: string; toStr: string } => {
  const str = typeof value === 'string' ? value : ''
  const comma = str.indexOf(',')
  return {
    fromStr: comma >= 0 ? str.slice(0, comma) : str,
    toStr: comma >= 0 ? str.slice(comma + 1) : '',
  }
}

// Re-export the base type so adapters can narrow `CoercibleProperty` params to
// their own `BaseProperty` subclasses without a second import.
export type { BaseProperty }
