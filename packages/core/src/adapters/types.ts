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
  | 'markdown'
  | 'textarea'
  | 'password'
  | 'currency'
  | 'phone'
  | 'uuid'
  | 'json'
  | 'enum'
  | 'previewMedia'
  | 'file'
  | 'm2m'
  | 'money'
  | 'color'

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

// ─── Time-series aggregation ─────────────────────────────────────────────

/**
 * Time bucket granularity. `'all'` collapses the whole range into a single
 * bucket — used for KPI tiles where we just want a scalar.
 */
export type TimeSeriesStep = 'day' | 'week' | 'month' | 'year' | 'all'

export interface TimeSeriesQuery {
  /** Property path of the date/datetime column used for X-axis bucketing. */
  dateField: string
  step: TimeSeriesStep
  metric: AggregationOp
  /** Required for non-count metrics (sum/avg/min/max). */
  field?: string
  from: Date
  to: Date
  /** List-page-style narrowing applied before aggregation. */
  filters?: Record<string, string>
  /**
   * Optional secondary breakdown — produces one series per distinct value.
   * Adapters truncate to `topN` series + an "other" bucket.
   */
  groupBy?: string
  /** Default 10. Larger values may impact response size. */
  topN?: number
  /**
   * When set, includes equal-length previous window aggregates. Only
   * meaningful for `step: 'all'` (KPI delta). Adapters return them as
   * a separate `previous` field.
   */
  comparePrevious?: boolean
}

export interface TimeSeriesPoint {
  /** ISO date string, `YYYY-MM-DD`. For `step: 'all'` this is the from-date. */
  date: string
  value: number
}

export interface TimeSeriesSeries {
  /** Series identifier. `'__total__'` when no `groupBy` is set. */
  key: string
  points: TimeSeriesPoint[]
}

export interface TimeSeriesResult {
  series: TimeSeriesSeries[]
  /** Populated when `comparePrevious: true`. */
  previous?: TimeSeriesSeries[]
  /**
   * Raw SQL the adapter executed. Returned for inspection only — the
   * controller decides whether to forward it to the client based on the
   * caller's role.
   */
  sql?: string
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
