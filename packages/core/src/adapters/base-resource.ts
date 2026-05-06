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
   * Run a callback inside a transaction. Default impl just runs the callback;
   * adapters should override to provide real transactional semantics.
   */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    return fn()
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
