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
    for (const key of Object.keys(flat)) {
      if (key.includes(PARAM_SEPARATOR)) {
        const [path, qualifier] = key.split(PARAM_SEPARATOR)
        if (path && qualifier) {
          const existing = (ranged[path] as { from?: string; to?: string }) ?? {}
          ranged[path] = { ...existing, [qualifier]: String(flat[key]) }
        }
      } else {
        ranged[key] = flat[key] as FilterValue
      }
    }
    // Re-aggregate nested keys (a.b -> { a: { b } }) for properties of mixed type.
    const reaggregated = unflatten(ranged) as Record<string, FilterValue>

    this.filters = {}
    for (const path of Object.keys(reaggregated)) {
      this.filters[path] = {
        path,
        property: resource.property(path),
        value: reaggregated[path] as FilterValue,
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
