import { count as countFn, eq, inArray } from 'drizzle-orm'
import {
  BaseRecord,
  BaseResource,
  type Filter,
  type FindOptions,
  type ParamsType,
} from '@modern-admin/core'
import { DrizzleProperty, extractForeignKeys, findPrimaryColumn } from './property.js'
import { filterToWhere, findOptionsToDrizzle } from './converters.js'
import type {
  DrizzleClientLike,
  DrizzleColumn,
  DrizzleResourceConfig,
  DrizzleTable,
} from './types.js'

interface DrizzleResourceInit extends DrizzleResourceConfig {
  client: DrizzleClientLike
  table: DrizzleTable
  tableKey: string
}

const isInit = (raw: unknown): raw is DrizzleResourceInit =>
  typeof raw === 'object' &&
  raw !== null &&
  'client' in raw &&
  'table' in raw &&
  typeof (raw as { table?: object }).table === 'object'

export class DrizzleResource extends BaseResource {
  public readonly client: DrizzleClientLike
  public readonly table: DrizzleTable
  public readonly tableKey: string
  private readonly _id: string
  private readonly _properties: DrizzleProperty[]
  private readonly idColumn: DrizzleColumn

  constructor(raw: unknown) {
    super()
    if (!isInit(raw)) {
      throw new Error('DrizzleResource requires { client, table, tableKey } config')
    }
    this.client = raw.client
    this.table = raw.table
    this.tableKey = raw.tableKey
    this._id = raw.id ?? raw.table._?.name ?? raw.tableKey

    const idColumn = findPrimaryColumn(raw.table)
    if (!idColumn) {
      throw new Error(`Drizzle table "${this._id}" has no primary-key column`)
    }
    this.idColumn = idColumn

    const fks = extractForeignKeys(raw.table)
    let position = 1
    this._properties = []
    for (const key of Object.keys(raw.table)) {
      if (key === '_') continue
      const col = raw.table[key] as DrizzleColumn | undefined
      if (!col || typeof col.name !== 'string') continue
      this._properties.push(new DrizzleProperty(col, fks[col.name] ?? null, position++))
    }
  }

  static override isAdapterFor(raw: unknown): boolean {
    return isInit(raw)
  }

  override id(): string {
    return this._id
  }

  override databaseName(): string {
    return this.table._?.name ?? this._id
  }

  override databaseType(): string {
    return 'drizzle'
  }

  override properties(): DrizzleProperty[] {
    return this._properties
  }

  override property(path: string): DrizzleProperty | null {
    return this._properties.find((p) => p.path() === path) ?? null
  }

  private castId(id: string | number): unknown {
    if (typeof id === 'number') return id
    if (this.idColumn.dataType === 'number' || this.idColumn.dataType === 'bigint') {
      const n = Number(id)
      return Number.isFinite(n) ? n : id
    }
    return id
  }

  /** Drop unknown keys so we never write to columns that don't exist. */
  private writableData(params: ParamsType): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const prop of this._properties) {
      const path = prop.path()
      if (path in params) out[path] = params[path]
    }
    return out
  }

  override async count(filter: Filter): Promise<number> {
    const where = filterToWhere(filter, this.table)
    let qb = this.client.select({ value: countFn() }).from(this.table)
    if (where !== undefined) qb = qb.where(where)
    const rows = (await qb) as Array<{ value: number | string }>
    const v = rows[0]?.value ?? 0
    return typeof v === 'number' ? v : Number(v)
  }

  override async find(filter: Filter, options: FindOptions): Promise<BaseRecord[]> {
    const where = filterToWhere(filter, this.table)
    const { limit, offset, orderBy } = findOptionsToDrizzle(options, this.table)
    let qb = this.client.select().from(this.table)
    if (where !== undefined) qb = qb.where(where)
    if (orderBy !== undefined) qb = qb.orderBy(orderBy)
    if (limit !== undefined) qb = qb.limit(limit)
    if (offset !== undefined) qb = qb.offset(offset)
    const rows = (await qb) as ParamsType[]
    return rows.map((row) => new BaseRecord(row, this))
  }

  override async findOne(id: string): Promise<BaseRecord | null> {
    const rows = (await this.client
      .select()
      .from(this.table)
      .where(eq(this.idColumn as never, this.castId(id) as never))
      .limit(1)) as ParamsType[]
    const row = rows[0]
    return row ? new BaseRecord(row, this) : null
  }

  override async findMany(ids: Array<string | number>): Promise<BaseRecord[]> {
    if (ids.length === 0) return []
    const cast = ids.map((id) => this.castId(id))
    const rows = (await this.client
      .select()
      .from(this.table)
      .where(inArray(this.idColumn as never, cast as never))) as ParamsType[]
    return rows.map((row) => new BaseRecord(row, this))
  }

  override async create(params: ParamsType): Promise<ParamsType> {
    const rows = await this.client
      .insert(this.table)
      .values(this.writableData(params))
      .returning()
    return (rows[0] ?? {}) as ParamsType
  }

  override async update(id: string, params: ParamsType): Promise<ParamsType> {
    const rows = await this.client
      .update(this.table)
      .set(this.writableData(params))
      .where(eq(this.idColumn as never, this.castId(id) as never))
      .returning()
    return (rows[0] ?? {}) as ParamsType
  }

  override async delete(id: string): Promise<void> {
    await this.client
      .delete(this.table)
      .where(eq(this.idColumn as never, this.castId(id) as never))
  }

  override async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (typeof this.client.transaction !== 'function') return fn()
    return this.client.transaction(async () => fn())
  }
}
