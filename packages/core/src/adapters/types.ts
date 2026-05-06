// Common adapter-layer types shared by BaseDatabase / BaseResource /
// BaseProperty / BaseRecord and built-in actions.

import type { PropertyErrors, RecordError } from '../errors'

/**
 * Built-in property type tags. Custom values are allowed but should be
 * mapped to one of these in the UI/transport layer.
 */
export type PropertyType =
  | 'string'
  | 'number'
  | 'float'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'mixed'
  | 'reference'
  | 'key-value'
  | 'richtext'
  | 'textarea'
  | 'password'
  | 'currency'
  | 'phone'
  | 'uuid'
  | 'json'
  | 'enum'

/**
 * Flat record params: dotted-path keys to scalar values. This is the canonical
 * shape used everywhere — flatten/unflatten happens at adapter boundaries.
 */
export type ParamsType = Record<string, unknown>

export type SortDirection = 'asc' | 'desc'

export interface FindOptions {
  limit?: number
  offset?: number
  sort?: {
    sortBy?: string
    direction?: SortDirection
  }
}

/**
 * Cursor-based pagination — extension over AdminJS' offset-only model.
 */
export interface StreamOptions {
  cursor?: string
  pageSize?: number
  sort?: { sortBy: string; direction: SortDirection }
}

/**
 * Aggregations exposed via the GraphQL transport. Adapters that don't support
 * aggregations should throw `NotImplementedError`.
 */
export type AggregationOp = 'count' | 'sum' | 'avg' | 'min' | 'max'

export interface AggregationRequest {
  op: AggregationOp
  field?: string
  groupBy?: string[]
}

export interface AggregationResult {
  group: Record<string, unknown>
  value: number | null
}

/**
 * Wire-friendly representation of a record. Decoupled from any UI framework.
 */
export interface RecordJSON {
  id: string
  title: string
  params: ParamsType
  populated: Record<string, RecordJSON | unknown>
  errors: PropertyErrors
  baseError: RecordError | null
}
