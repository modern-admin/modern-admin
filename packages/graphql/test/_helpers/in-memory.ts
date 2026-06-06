// Tiny in-memory adapter dedicated to graphql tests. Implements only
// the BaseDatabase / BaseResource surface the graphql schema/resolver
// tests touch — kept small and inline so the test suite doesn't depend
// on any production adapter.

import {
  BaseDatabase,
  BaseProperty,
  BaseRecord,
  BaseResource,
  type Filter,
  type FindOptions,
  type ParamsType,
} from '@modern-admin/core'

export interface Row {
  id: string
  [key: string]: unknown
}

export interface Table {
  name: string
  properties: BaseProperty[]
  rows: Row[]
}

export interface Db {
  __mem: true
  tables: Table[]
}

export class MemDatabase extends BaseDatabase {
  constructor(private readonly db: Db) {
    super(db)
  }

  static override isAdapterFor(input: unknown): boolean {
    return typeof input === 'object' && input !== null && (input as Db).__mem === true
  }

  override resources(): BaseResource[] {
    return this.db.tables.map((t) => new MemResource(t))
  }
}

export class MemResource extends BaseResource {
  constructor(private readonly table: Table) {
    super()
  }

  static override isAdapterFor(raw: unknown): boolean {
    return (
      typeof raw === 'object' &&
      raw !== null &&
      Array.isArray((raw as Table).rows) &&
      Array.isArray((raw as Table).properties)
    )
  }

  override id(): string {
    return this.table.name
  }

  override databaseName(): string {
    return 'mem'
  }

  override properties(): BaseProperty[] {
    return this.table.properties
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
    const row: Row = {
      ...(params as Row),
      id: String((params as Row).id ?? this.table.rows.length + 1),
    }
    this.table.rows.push(row)
    return row
  }

  override async update(id: string, params: ParamsType): Promise<ParamsType> {
    const idx = this.table.rows.findIndex((r) => r.id === id)
    if (idx < 0) throw new Error(`row "${id}" not found`)
    const next = { ...this.table.rows[idx], ...params, id } as Row
    this.table.rows[idx] = next
    return next
  }

  override async delete(id: string): Promise<void> {
    const idx = this.table.rows.findIndex((r) => r.id === id)
    if (idx >= 0) this.table.rows.splice(idx, 1)
  }
}

export const seed = (): Db => ({
  __mem: true,
  tables: [
    {
      name: 'users',
      properties: [
        new BaseProperty({ path: 'id', isId: true }),
        new BaseProperty({ path: 'name', type: 'string' }),
      ],
      rows: [
        { id: '1', name: 'Ada' },
        { id: '2', name: 'Alan' },
      ],
    },
    {
      name: 'posts',
      properties: [
        new BaseProperty({ path: 'id', isId: true }),
        new BaseProperty({ path: 'title', type: 'string' }),
        new BaseProperty({ path: 'authorId', type: 'reference', reference: 'users' }),
      ],
      rows: [
        { id: '1', title: 'Hello', authorId: '1' },
        { id: '2', title: 'World', authorId: '2' },
      ],
    },
  ],
})
