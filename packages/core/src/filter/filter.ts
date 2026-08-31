import type { BaseProperty, BaseResource } from '../adapters'
import { z } from 'zod'
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
 * Explicit filter operators. New callers pass structured {@link FilterCriterion}
 * objects; `OPERATOR:value` strings remain supported as a legacy read format.
 *
 * - `eq`     — exact equals (case-insensitive for strings)
 * - `neq`    — not equals
 * - `co`     — contains substring
 * - `nco`    — does not contain substring
 * - `sw`     — starts with
 * - `ew`     — ends with
 * - `empty`  — is null or empty string
 * - `nempty` — is not null and not empty string
 * - `in`     — value is one of a structured list (legacy comma lists supported)
 */
export type FilterOperator =
  'eq' | 'neq' | 'co' | 'nco' | 'sw' | 'ew' | 'empty' | 'nempty' | 'in' | 'gt' | 'lt' | 'between'

/** Set of recognised operator prefixes. Used to disambiguate `op:value`. */
export const FILTER_OPERATORS: ReadonlySet<string> = new Set<FilterOperator>([
  'eq',
  'neq',
  'co',
  'nco',
  'sw',
  'ew',
  'empty',
  'nempty',
  'in',
  'gt',
  'lt',
  'between',
])

export type InFilterScalar = string | number

const filterScalarZ = z.union([z.string(), z.number().finite(), z.boolean(), z.null()])
const inFilterScalarZ = z.union([z.string(), z.number().finite()])
const valueFilterOperatorZ = z.enum(['eq', 'neq', 'co', 'nco', 'sw', 'ew', 'gt', 'lt'])
const nullaryFilterOperatorZ = z.enum(['empty', 'nempty'])

/**
 * Collision-free filter representation used by new transports and persisted
 * dashboard definitions. Operator metadata is kept separate from user data,
 * so every string remains representable without escaping or reserved prefixes.
 */
export const filterCriterionZ = z.discriminatedUnion('operator', [
  z
    .object({
      operator: valueFilterOperatorZ,
      value: filterScalarZ,
    })
    .strict(),
  z
    .object({
      operator: z.literal('in'),
      values: z.array(inFilterScalarZ),
    })
    .strict(),
  z
    .object({
      operator: z.literal('between'),
      from: z.string().optional(),
      to: z.string().optional(),
    })
    .strict(),
  z
    .object({
      operator: nullaryFilterOperatorZ,
    })
    .strict(),
])

export type FilterCriterion = z.infer<typeof filterCriterionZ>

/**
 * Parse an operator-prefixed filter value string.
 *
 * Format: `OPERATOR:value` where OPERATOR is one of the known operators.
 * If the string has no known operator prefix, returns `{ operator: null }`.
 *
 * Examples:
 * - `'co:john'`     → `{ operator: 'co', value: 'john' }`
 * - `'in:a,b'`      → legacy comma-separated payload
 * - `'empty:'`       → `{ operator: 'empty', value: '' }`
 * - `'john'`         → `{ operator: null, value: 'john' }`
 */
export function parseOperatorValue(raw: string): {
  operator: FilterOperator | null
  value: string
} {
  const colonIdx = raw.indexOf(':')
  if (colonIdx === -1) return { operator: null, value: raw }
  const prefix = raw.slice(0, colonIdx)
  if (FILTER_OPERATORS.has(prefix)) {
    return { operator: prefix as FilterOperator, value: raw.slice(colonIdx + 1) }
  }
  return { operator: null, value: raw }
}

export type FilterValue =
  string | number | boolean | null | { from?: string; to?: string } | Array<string | number>

/** Values accepted at filter boundaries during the legacy-to-structured migration. */
export type FilterInput = FilterValue | FilterCriterion

export const filterInputZ = z.union([
  filterCriterionZ,
  filterScalarZ,
  z.array(inFilterScalarZ),
  z.object({ from: z.string().optional(), to: z.string().optional() }).strict(),
])

export const filterMapZ = z.record(z.string(), filterInputZ)
export type FilterMap = z.infer<typeof filterMapZ>

export interface FilterElement {
  path: string
  property: BaseProperty | null
  value: FilterValue
  /** Explicit filter operator. `null` → legacy implicit behavior
   *  (contains for strings, equals for others). */
  operator: FilterOperator | null
}

export type RawFilters = Record<string, unknown>

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const FORBIDDEN_FILTER_PATH_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype'])

const isSafeFilterPath = (path: string): boolean =>
  path.split('.').every((segment) => !FORBIDDEN_FILTER_PATH_SEGMENTS.has(segment))

/**
 * Remove structured criteria before the legacy flatten/unflatten path sees
 * them. An object declaring `operator` is unambiguously protocol data and is
 * parsed strictly: malformed criteria fail closed instead of becoming dotted
 * pseudo-properties that adapters might silently ignore.
 */
const extractStructuredCriteria = (
  value: unknown,
  path: string,
  criteria: Map<string, FilterCriterion>,
): unknown => {
  if (!isPlainRecord(value)) return value
  if (path && Object.hasOwn(value, 'operator')) {
    if (isSafeFilterPath(path)) criteria.set(path, filterCriterionZ.parse(value))
    return undefined
  }

  const remainder: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key
    const extracted = extractStructuredCriteria(child, childPath, criteria)
    if (extracted !== undefined) remainder[key] = extracted
  }
  return remainder
}

const criterionValue = (criterion: FilterCriterion): FilterValue => {
  switch (criterion.operator) {
    case 'in':
      return criterion.values
    case 'between':
      return {
        ...(criterion.from !== undefined ? { from: criterion.from } : {}),
        ...(criterion.to !== undefined ? { to: criterion.to } : {}),
      }
    case 'empty':
    case 'nempty':
      return ''
    default:
      return criterion.value
  }
}

const elementCriterion = (element: FilterElement): FilterInput => {
  const { operator, value } = element
  if (operator === null) return value
  if (operator === 'in') {
    return { operator, values: Array.isArray(value) ? value : [String(value)] }
  }
  if (operator === 'between') {
    const range = value !== null && !Array.isArray(value) && typeof value === 'object' ? value : {}
    return {
      operator,
      ...(range.from !== undefined ? { from: range.from } : {}),
      ...(range.to !== undefined ? { to: range.to } : {}),
    }
  }
  if (operator === 'empty' || operator === 'nempty') return { operator }
  return { operator, value: value as string | number | boolean | null }
}

/**
 * Filter wrapping selected criteria. Exposes adapters a uniform shape
 * regardless of which transport assembled the filters (REST query string,
 * GraphQL input, or programmatic API).
 */
export class Filter {
  public readonly filters: Record<string, FilterElement>

  constructor(
    rawFilters: RawFilters | undefined,
    public readonly resource: BaseResource,
  ) {
    const structuredCriteria = new Map<string, FilterCriterion>()
    const legacyFilters = extractStructuredCriteria(rawFilters ?? {}, '', structuredCriteria)
    const flat = flatten(legacyFilters)
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

    this.filters = Object.create(null) as Record<string, FilterElement>
    for (const path of Object.keys(reaggregated)) {
      let value = reaggregated[path] as FilterValue
      let operator: FilterOperator | null = operators[path] ?? null

      if (operator === 'in' && typeof value === 'string') {
        value = value ? value.split(',') : []
      }

      // Parse operator from value prefix when no explicit ~~op was provided.
      if (operator === null && typeof value === 'string') {
        const parsed = parseOperatorValue(value)
        if (parsed.operator) {
          operator = parsed.operator
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

    for (const [path, criterion] of structuredCriteria) {
      this.filters[path] = {
        path,
        property: resource.property(path),
        value: criterionValue(criterion),
        operator: criterion.operator,
      }
    }
  }

  get(path: string): FilterElement | null {
    return this.filters[path] ?? null
  }

  reduce<T>(callback: (memo: T, element: FilterElement) => T, initial: T): T {
    return Object.values(this.filters).reduce(callback, initial)
  }

  isVisible(): boolean {
    return Object.keys(this.filters).length > 0
  }

  toJSON(): FilterMap {
    const out: FilterMap = {}
    for (const key of Object.keys(this.filters)) {
      out[key] = elementCriterion(this.filters[key]!)
    }
    return out
  }
}
