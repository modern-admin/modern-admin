import type { BaseProperty, BaseResource } from '../adapters'
import { flatten, unflatten } from '../utils/flat.js'

export const PARAM_SEPARATOR = '~~'

export const MATCHING_PATTERNS = {
  EQ: 'equals',
  NE: 'notEquals',
  CO: 'contains',
  EW: 'endsWith',
  SW: 'startsWith',
  GT: 'greaterThan',
  LT: 'lessThan',
} as const

/**
 * Explicit filter operators. Encoded in URL as `filters[field]=OPERATOR:value`.
 *
 * - `eq`     — exact equals (case-insensitive for strings)
 * - `neq`    — not equals
 * - `co`     — contains substring
 * - `nco`    — does not contain substring
 * - `sw`     — starts with
 * - `ew`     — ends with
 * - `empty`  — is null or empty string
 * - `nempty` — is not null and not empty string
 * - `in`     — value is one of (comma-separated list → multi-select)
 */
export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'co'
  | 'nco'
  | 'sw'
  | 'ew'
  | 'empty'
  | 'nempty'
  | 'in'
  | 'gt'
  | 'lt'
  | 'between'

/** Set of recognised operator prefixes. Used to disambiguate `op:value`. */
export const FILTER_OPERATORS: ReadonlySet<string> = new Set<FilterOperator>([
  'eq', 'neq', 'co', 'nco', 'sw', 'ew', 'empty', 'nempty', 'in', 'gt', 'lt', 'between',
])

/**
 * Parse an operator-prefixed filter value string.
 *
 * Format: `OPERATOR:value` where OPERATOR is one of the known operators.
 * If the string has no known operator prefix, returns `{ operator: null }`.
 *
 * Examples:
 * - `'co:john'`     → `{ operator: 'co', value: 'john' }`
 * - `'in:a,b,c'`    → `{ operator: 'in', value: 'a,b,c' }`
 * - `'empty:'`       → `{ operator: 'empty', value: '' }`
 * - `'john'`         → `{ operator: null, value: 'john' }`
 */
export function parseOperatorValue(raw: string): { operator: FilterOperator | null; value: string } {
  const colonIdx = raw.indexOf(':')
  if (colonIdx === -1) return { operator: null, value: raw }
  const prefix = raw.slice(0, colonIdx)
  if (FILTER_OPERATORS.has(prefix)) {
    return { operator: prefix as FilterOperator, value: raw.slice(colonIdx + 1) }
  }
  return { operator: null, value: raw }
}

export type FilterValue =
  | string
  | number
  | boolean
  | null
  | { from?: string; to?: string }
  | Array<string | number>

export interface FilterElement {
  path: string
  property: BaseProperty | null
  value: FilterValue
  /** Explicit filter operator. `null` → legacy implicit behavior
   *  (contains for strings, equals for others). */
  operator: FilterOperator | null
}

export type RawFilters = Record<string, unknown>

/**
 * Filter wrapping selected criteria. Exposes adapters a uniform shape
 * regardless of which transport assembled the filters (REST query string,
 * GraphQL input, or programmatic API).
 */
export class Filter {
  public readonly filters: Record<string, FilterElement>

  constructor(rawFilters: RawFilters | undefined, public readonly resource: BaseResource) {
    const flat = flatten(rawFilters ?? {})
    // Allow `field~~from` / `field~~to` ranges by un-flattening with our separator.
    const ranged: Record<string, FilterValue> = {}
    /** Per-field operator extracted from `field~~op` qualifiers or value prefixes. */
    const operators: Record<string, FilterOperator | null> = {}
    for (const key of Object.keys(flat)) {
      if (key.includes(PARAM_SEPARATOR)) {
        const [path, qualifier] = key.split(PARAM_SEPARATOR)
        if (path && qualifier) {
          // `field~~op=co` stores the operator separately.
          if (qualifier === 'op') {
            const op = String(flat[key])
            if (FILTER_OPERATORS.has(op)) {
              operators[path] = op as FilterOperator
            }
          } else {
            const existing = (ranged[path] as { from?: string; to?: string }) ?? {}
            ranged[path] = { ...existing, [qualifier]: String(flat[key]) }
          }
        }
      } else {
        ranged[key] = flat[key] as FilterValue
      }
    }
    // Re-aggregate nested keys (a.b -> { a: { b } }) for properties of mixed type.
    const reaggregated = unflatten(ranged) as Record<string, FilterValue>

    this.filters = {}
    for (const path of Object.keys(reaggregated)) {
      let value = reaggregated[path] as FilterValue
      let operator: FilterOperator | null = operators[path] ?? null

      // Parse operator from value prefix when no explicit ~~op was provided.
      if (operator === null && typeof value === 'string') {
        const parsed = parseOperatorValue(value)
        if (parsed.operator) {
          operator = parsed.operator
          // `in:a,b,c` → array value
          if (operator === 'in') {
            value = parsed.value ? parsed.value.split(',') : []
          } else {
            value = parsed.value
          }
        }
      }

      this.filters[path] = {
        path,
        property: resource.property(path),
        value,
        operator,
      }
    }
  }

  get(path: string): FilterElement | null {
    return this.filters[path] ?? null
  }

  reduce<T>(
    callback: (memo: T, element: FilterElement) => T,
    initial: T,
  ): T {
    return Object.values(this.filters).reduce(callback, initial)
  }

  isVisible(): boolean {
    return Object.keys(this.filters).length > 0
  }

  toJSON(): Record<string, FilterValue> {
    const out: Record<string, FilterValue> = {}
    for (const key of Object.keys(this.filters)) {
      out[key] = this.filters[key]!.value
    }
    return out
  }
}
