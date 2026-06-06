import {
  BaseDatabase,
  BaseProperty,
  BaseRecord,
  BaseResource,
  type Filter,
  type FindOptions,
  type ParamsType,
} from '@modern-admin/core'

export interface FakeRow {
  id: string
  [key: string]: unknown
}

export interface FakeTable {
  name: string
  rows: FakeRow[]
}

export class FakeDatabase extends BaseDatabase {
  constructor(private readonly tables: FakeTable[]) {
    super(tables)
  }

  static override isAdapterFor(db: unknown): boolean {
    return Array.isArray(db) && db.every((t) => typeof t === 'object' && t !== null && 'name' in t)
  }

  override resources(): BaseResource[] {
    return this.tables.map((t) => new FakeResource(t))
  }
}

export class FakeResource extends BaseResource {
  private readonly props: BaseProperty[]

  constructor(private readonly table: FakeTable) {
    super()
    this.props = [
      new BaseProperty({ path: 'id', isId: true }),
      new BaseProperty({ path: 'name', type: 'string' }),
    ]
  }

  static override isAdapterFor(raw: unknown): boolean {
    return typeof raw === 'object' && raw !== null && 'name' in raw && 'rows' in raw
  }

  override id(): string {
    return this.table.name
  }

  override databaseName(): string {
    return 'fake'
  }

  override properties(): BaseProperty[] {
    return this.props
  }

  override async count(_filter: Filter): Promise<number> {
    return this.table.rows.length
  }

  override async find(_filter: Filter, options: FindOptions): Promise<BaseRecord[]> {
    const offset = options.offset ?? 0
    const limit = options.limit ?? this.table.rows.length
    return this.table.rows
      .slice(offset, offset + limit)
      .map((row) => new BaseRecord(row, this))
  }

  override async findOne(id: string): Promise<BaseRecord | null> {
    const row = this.table.rows.find((r) => r.id === id)
    return row ? new BaseRecord(row, this) : null
  }

  override async findMany(ids: Array<string | number>): Promise<BaseRecord[]> {
    const set = new Set(ids.map(String))
    return this.table.rows
      .filter((r) => set.has(String(r.id)))
      .map((row) => new BaseRecord(row, this))
  }

  override async create(params: ParamsType): Promise<ParamsType> {
    const row = { ...(params as FakeRow), id: String(this.table.rows.length + 1) }
    this.table.rows.push(row)
    return row
  }

  override async update(id: string, params: ParamsType): Promise<ParamsType> {
    const idx = this.table.rows.findIndex((r) => r.id === id)
    this.table.rows[idx] = { ...this.table.rows[idx], ...params } as FakeRow
    return this.table.rows[idx]!
  }

  override async delete(id: string): Promise<void> {
    const idx = this.table.rows.findIndex((r) => r.id === id)
    if (idx >= 0) this.table.rows.splice(idx, 1)
  }
}
