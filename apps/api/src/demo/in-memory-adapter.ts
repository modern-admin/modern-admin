// Reference in-memory adapter so the API can boot without external infra.
// Demonstrates how a third-party adapter would slot in: subclass BaseDatabase
// and BaseResource, and ResourcesFactory wires them up automatically.

import {
  BaseDatabase,
  BaseProperty,
  BaseRecord,
  BaseResource,
  type Filter,
  type FindOptions,
  type ParamsType,
} from '@modern-admin/core'

export interface InMemoryRow {
  id: string
  [key: string]: unknown
}

export interface InMemoryTable {
  name: string
  /** Property declarations driving the generated UI / DTO. */
  properties: BaseProperty[]
  rows: InMemoryRow[]
}

export interface InMemoryDb {
  __inMemory: true
  tables: InMemoryTable[]
}

export class InMemoryDatabase extends BaseDatabase {
  constructor(private readonly db: InMemoryDb) {
    super(db)
  }

  static override isAdapterFor(input: unknown): boolean {
    return typeof input === 'object' && input !== null && (input as InMemoryDb).__inMemory === true
  }

  override resources(): BaseResource[] {
    return this.db.tables.map((t) => new InMemoryResource(t))
  }
}

export class InMemoryResource extends BaseResource {
  constructor(private readonly table: InMemoryTable) {
    super()
  }

  static override isAdapterFor(raw: unknown): boolean {
    return (
      typeof raw === 'object' &&
      raw !== null &&
      Array.isArray((raw as InMemoryTable).rows) &&
      Array.isArray((raw as InMemoryTable).properties)
    )
  }

  override id(): string {
    return this.table.name
  }

  override databaseName(): string {
    return 'in-memory'
  }

  override databaseType(): string {
    return 'demo'
  }

  override properties(): BaseProperty[] {
    return this.table.properties
  }

  private matches(row: InMemoryRow, filter: Filter): boolean {
    const filters = filter.filters ?? {}
    for (const [path, entry] of Object.entries(filters)) {
      const needle = entry.value
      if (needle == null || needle === '') continue

      // Date-range filters: keys ending with _from / _to produced by the
      // date-range picker. Values are ISO date strings — lexicographic
      // comparison works because yyyy-MM-dd strings sort correctly.
      if (path.endsWith('_from') || path.endsWith('_to')) {
        const basePath = path.slice(0, path.lastIndexOf('_'))
        const value = String(row[basePath] ?? '')
        if (!value) continue
        const needleStr = String(needle)
        if (path.endsWith('_from') && value < needleStr) return false
        if (path.endsWith('_to') && value > needleStr) return false
        continue
      }

      const value = row[path]
      // Array fields (e.g. many-to-many tagIds): match when the needle equals
      // (or is contained in) any element. Strings do case-insensitive substring.
      if (Array.isArray(value)) {
        const items = value.map((v) => String(v).toLowerCase())
        const target = String(needle).toLowerCase()
        if (!items.some((i) => i.includes(target))) return false
        continue
      }
      if (typeof needle === 'string') {
        if (!String(value ?? '').toLowerCase().includes(needle.toLowerCase())) return false
      } else if (needle !== value) {
        return false
      }
    }
    return true
  }

  override async count(filter: Filter): Promise<number> {
    return this.table.rows.filter((r) => this.matches(r, filter)).length
  }

  override async find(filter: Filter, options: FindOptions): Promise<BaseRecord[]> {
    const filtered = this.table.rows.filter((r) => this.matches(r, filter))
    const sortBy = options.sort?.sortBy
    const direction = options.sort?.direction
    if (sortBy) {
      filtered.sort((a, b) => {
        const av = a[sortBy]
        const bv = b[sortBy]
        if (av === bv) return 0
        const cmp = (av as number | string) > (bv as number | string) ? 1 : -1
        return direction === 'desc' ? -cmp : cmp
      })
    }
    const offset = options.offset ?? 0
    const limit = options.limit ?? filtered.length
    return filtered.slice(offset, offset + limit).map((row) => new BaseRecord(row, this))
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
    const row: InMemoryRow = {
      ...(params as InMemoryRow),
      id: String((params as InMemoryRow).id ?? this.table.rows.length + 1),
    }
    this.table.rows.push(row)
    return row
  }

  override async update(id: string, params: ParamsType): Promise<ParamsType> {
    const idx = this.table.rows.findIndex((r) => r.id === id)
    if (idx < 0) throw new Error(`Row "${id}" not found in "${this.table.name}"`)
    const next = { ...this.table.rows[idx], ...params, id } as InMemoryRow
    this.table.rows[idx] = next
    return next
  }

  override async delete(id: string): Promise<void> {
    const idx = this.table.rows.findIndex((r) => r.id === id)
    if (idx >= 0) this.table.rows.splice(idx, 1)
  }
}
