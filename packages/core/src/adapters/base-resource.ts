import { NotImplementedError } from '../errors'
import type { ResourceDecorator } from '../decorators/resource-decorator.js'
import type { Filter } from '../filter/filter.js'
import { BaseRecord } from './base-record.js'
import type { BaseProperty } from './base-property.js'
import type {
  AggregationRequest,
  AggregationResult,
  FindOptions,
  ParamsType,
  StreamOptions,
  TimeSeriesQuery,
  TimeSeriesResult,
} from './types.js'

/**
 * Abstract resource. Adapters subclass this to expose ORM-specific tables /
 * collections. The contract is wider than AdminJS' to support GraphQL
 * aggregations, cursor-based streaming, and atomic batch operations.
 */
export abstract class BaseResource {
  /** @internal — assigned by ResourcesFactory at decoration time. */
  public _decorated: ResourceDecorator | null = null

  /**
   * Adapters may override to filter raw resources they don't support. Used by
   * ResourcesFactory to pick a Resource subclass for a raw input.
   */
  static isAdapterFor(_rawResource: unknown): boolean {
    return false
  }

  abstract id(): string

  abstract databaseName(): string

  /** Optional sidebar grouping label. Falls back to "other" by default. */
  databaseType(): string {
    return 'other'
  }

  abstract properties(): BaseProperty[]

  /** Lookup property by dotted path. Default impl walks `properties()`. */
  property(path: string): BaseProperty | null {
    return this.properties().find((p) => p.path() === path) ?? null
  }

  abstract count(filter: Filter): Promise<number>

  abstract find(filter: Filter, options: FindOptions): Promise<BaseRecord[]>

  abstract findOne(id: string): Promise<BaseRecord | null>

  abstract findMany(ids: Array<string | number>): Promise<BaseRecord[]>

  abstract create(params: ParamsType): Promise<ParamsType>

  abstract update(id: string, params: ParamsType): Promise<ParamsType>

  abstract delete(id: string): Promise<void>

  /** Build an in-memory record without persisting it. */
  build(params: ParamsType): BaseRecord {
    return new BaseRecord(params, this)
  }

  /**
   * Cursor-based streaming. Default impl falls back to offset pagination via
   * `find`, which adapters should override for true cursor semantics.
   */
  async *streamFind(
    filter: Filter,
    options: StreamOptions = {},
  ): AsyncIterable<BaseRecord> {
    const pageSize = options.pageSize ?? 100
    let offset = 0
    while (true) {
      const batch = await this.find(filter, {
        limit: pageSize,
        offset,
        ...(options.sort ? { sort: options.sort } : {}),
      })
      if (batch.length === 0) return
      for (const rec of batch) yield rec
      if (batch.length < pageSize) return
      offset += pageSize
    }
  }

  /** Aggregations are optional. Default impl rejects. */
  async aggregate(_filter: Filter, _req: AggregationRequest): Promise<AggregationResult[]> {
    throw new NotImplementedError(`${this.constructor.name}#aggregate`)
  }

  /**
   * Time-series aggregation — returns one or more series of `{date, value}`
   * points produced by `DATE_TRUNC(step, dateField)` (or the dialect-equivalent).
   * Optional only because non-relational adapters cannot implement it
   * efficiently; the dashboard UI degrades gracefully when the method is
   * missing or rejects with `NotImplementedError`.
   */
  async aggregateTimeSeries(_filter: Filter, _query: TimeSeriesQuery): Promise<TimeSeriesResult> {
    throw new NotImplementedError(`${this.constructor.name}#aggregateTimeSeries`)
  }

  /**
   * Whether `aggregateTimeSeries` is implemented by this adapter. Used by
   * the controller to advertise capability so the dashboard can hide the
   * chart builder for unsupported sources.
   */
  supportsTimeSeries(): boolean {
    return false
  }

  /**
   * Run a callback inside a transaction. Default impl just runs the callback;
   * adapters should override to provide real transactional semantics.
   */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    return fn()
  }

  /**
   * Returns the property path to use as the human-readable record title.
   * Checks the decorator's `titleProperty` option first; falls back to the
   * first property whose `isTitle()` returns true (TITLE_COLUMN_NAMES match).
   */
  titlePropertyPath(): string | null {
    const override = (this._decorated?.options as { titleProperty?: string } | null)?.titleProperty
    if (override) return override
    return this.properties().find((p) => p.isTitle())?.path() ?? null
  }

  /** @internal */
  assignDecorator(decorator: ResourceDecorator): void {
    this._decorated = decorator
  }

  decorate(): ResourceDecorator {
    if (!this._decorated) {
      throw new Error(`Resource "${this.id()}" has not been decorated yet`)
    }
    return this._decorated
  }
}
