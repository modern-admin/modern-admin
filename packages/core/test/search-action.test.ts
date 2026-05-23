// Verifies behaviour of the built-in `search` action that powers
// `/admin/api/global-search`. The original implementation searched only
// one column (matching the `TITLE_COLUMN_NAMES` heuristic) which made
// many resources unsearchable in practice — these cases pin down the
// expected behaviour so regressions surface immediately.

import { describe, expect, test } from 'bun:test'
import { ModernAdmin } from '../src/modern-admin.js'
import { BaseProperty } from '../src/adapters/base-property.js'
import { BaseRecord } from '../src/adapters/base-record.js'
import { Filter } from '../src/filter/filter.js'
import { BaseDatabase } from '../src/adapters/base-database.js'
import { BaseResource } from '../src/adapters/base-resource.js'
import type { FindOptions, ParamsType } from '../src/adapters/types.js'
import type { ActionRequest, ListActionResponse } from '../src/actions'
import type { Adapter } from '../src/factories/resources-factory.js'

// ── Minimal filter-respecting in-memory adapter ──────────────────────────────

interface SearchableRow {
  id: string
  [key: string]: unknown
}

interface SearchableTable {
  name: string
  rows: SearchableRow[]
  properties: BaseProperty[]
}

class SearchableDatabase extends BaseDatabase {
  constructor(private readonly tables: SearchableTable[]) {
    super(tables)
  }
  static override isAdapterFor(db: unknown): boolean {
    return Array.isArray(db) && db.every(
      (t) => typeof t === 'object' && t !== null && 'name' in t && 'properties' in t,
    )
  }
  override resources(): BaseResource[] {
    return this.tables.map((t) => new SearchableResource(t))
  }
}

class SearchableResource extends BaseResource {
  constructor(private readonly table: SearchableTable) {
    super()
  }
  static override isAdapterFor(raw: unknown): boolean {
    return typeof raw === 'object' && raw !== null && 'rows' in raw && 'properties' in raw
  }
  override id(): string { return this.table.name }
  override databaseName(): string { return 'searchable' }
  override properties(): BaseProperty[] { return this.table.properties }

  private matches(row: SearchableRow, filter: Filter): boolean {
    for (const entry of Object.values(filter.filters)) {
      const cell = row[entry.path]
      const needle = entry.value
      // Implicit operator (null) on strings → case-insensitive contains.
      if (typeof needle === 'string' && entry.operator === null) {
        if (!String(cell ?? '').toLowerCase().includes(needle.toLowerCase())) return false
        continue
      }
      if (Array.isArray(needle)) {
        if (!needle.map(String).includes(String(cell))) return false
        continue
      }
      if (String(cell) !== String(needle)) return false
    }
    return true
  }

  override async count(filter: Filter): Promise<number> {
    return this.table.rows.filter((r) => this.matches(r, filter)).length
  }
  override async find(filter: Filter, options: FindOptions): Promise<BaseRecord[]> {
    const matched = this.table.rows.filter((r) => this.matches(r, filter))
    const offset = options.offset ?? 0
    const limit = options.limit ?? matched.length
    return matched.slice(offset, offset + limit).map((row) => new BaseRecord(row, this))
  }
  override async findOne(id: string): Promise<BaseRecord | null> {
    const row = this.table.rows.find((r) => String(r.id) === String(id))
    return row ? new BaseRecord(row, this) : null
  }
  override async findMany(ids: Array<string | number>): Promise<BaseRecord[]> {
    const set = new Set(ids.map(String))
    return this.table.rows.filter((r) => set.has(String(r.id))).map((r) => new BaseRecord(r, this))
  }
  override async create(params: ParamsType): Promise<ParamsType> {
    const row = { ...(params as SearchableRow), id: String((params as SearchableRow).id ?? this.table.rows.length + 1) }
    this.table.rows.push(row)
    return row
  }
  override async update(id: string, params: ParamsType): Promise<ParamsType> {
    const idx = this.table.rows.findIndex((r) => r.id === id)
    if (idx < 0) throw new Error(`row ${id} not found`)
    this.table.rows[idx] = { ...this.table.rows[idx], ...params } as SearchableRow
    return this.table.rows[idx]!
  }
  override async delete(id: string): Promise<void> {
    const idx = this.table.rows.findIndex((r) => r.id === id)
    if (idx >= 0) this.table.rows.splice(idx, 1)
  }
}

const adapter = { Database: SearchableDatabase, Resource: SearchableResource } as unknown as Adapter

const searchReq = (resourceId: string, q: string): ActionRequest => ({
  params: { resourceId, action: 'search', query: q },
  method: 'get',
  query: { q },
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('built-in search action — title property', () => {
  test('finds records by case-insensitive substring of `name`', async () => {
    const admin = new ModernAdmin({
      resources: [{
        resource: {
          name: 'people',
          properties: [
            new BaseProperty({ path: 'id', isId: true }),
            new BaseProperty({ path: 'name', type: 'string' }),
          ],
          rows: [
            { id: '1', name: 'Ada Lovelace' },
            { id: '2', name: 'Alan Turing' },
            { id: '3', name: 'Grace Hopper' },
          ],
        },
      }],
      adapters: [adapter],
    })
    const res = await admin.invoke<ListActionResponse>(searchReq('people', 'ada'))
    const ids = res.records.map((r) => r.id).sort()
    expect(ids).toEqual(['1'])
  })

  test('finds records by `email` substring (title-column heuristic)', async () => {
    const admin = new ModernAdmin({
      resources: [{
        resource: {
          name: 'customers',
          properties: [
            new BaseProperty({ path: 'id', isId: true }),
            new BaseProperty({ path: 'email', type: 'string' }),
          ],
          rows: [
            { id: '1', email: 'ada.lovelace@example.com' },
            { id: '2', email: 'alan.turing@example.com' },
          ],
        },
      }],
      adapters: [adapter],
    })
    const res = await admin.invoke<ListActionResponse>(searchReq('customers', 'ada'))
    expect(res.records.map((r) => r.id)).toEqual(['1'])
  })
})

describe('built-in search action — id lookup', () => {
  test('finds a record by exact id', async () => {
    const admin = new ModernAdmin({
      resources: [{
        resource: {
          name: 'items',
          properties: [
            new BaseProperty({ path: 'id', isId: true }),
            new BaseProperty({ path: 'name', type: 'string' }),
          ],
          rows: [
            { id: 'abc-123', name: 'Foo' },
            { id: 'def-456', name: 'Bar' },
          ],
        },
      }],
      adapters: [adapter],
    })
    const res = await admin.invoke<ListActionResponse>(searchReq('items', 'abc-123'))
    expect(res.records.map((r) => r.id)).toContain('abc-123')
  })

  test('finds a record by id substring', async () => {
    const admin = new ModernAdmin({
      resources: [{
        resource: {
          name: 'items',
          properties: [
            new BaseProperty({ path: 'id', isId: true }),
            new BaseProperty({ path: 'name', type: 'string' }),
          ],
          rows: [
            { id: 'abc-123-xyz', name: 'Foo' },
            { id: 'def-456-xyz', name: 'Bar' },
          ],
        },
      }],
      adapters: [adapter],
    })
    const res = await admin.invoke<ListActionResponse>(searchReq('items', '456'))
    expect(res.records.map((r) => r.id)).toEqual(['def-456-xyz'])
  })
})

describe('built-in search action — resources with no default title column', () => {
  test('finds by a custom `titleProperty` override (e.g. `displayName`)', async () => {
    const admin = new ModernAdmin({
      resources: [{
        resource: {
          name: 'accounts',
          properties: [
            new BaseProperty({ path: 'id', isId: true }),
            new BaseProperty({ path: 'displayName', type: 'string' }),
          ],
          rows: [
            { id: '1', displayName: 'Ada Lovelace' },
            { id: '2', displayName: 'Alan Turing' },
          ],
        },
        options: {
          id: 'accounts',
          titleProperty: 'displayName',
        },
      }],
      adapters: [adapter],
    })
    const res = await admin.invoke<ListActionResponse>(searchReq('accounts', 'ada'))
    expect(res.records.map((r) => r.id)).toEqual(['1'])
  })

  test('finds by any visible string field when no title property is configured', async () => {
    // Catalog with `sku` and `description` and zero default-title columns.
    // Users expect to be able to find products by SKU or description text.
    const admin = new ModernAdmin({
      resources: [{
        resource: {
          name: 'products',
          properties: [
            new BaseProperty({ path: 'id', isId: true }),
            new BaseProperty({ path: 'sku', type: 'string' }),
            new BaseProperty({ path: 'description', type: 'string' }),
          ],
          rows: [
            { id: '1', sku: 'ALPHA-001', description: 'Premium widget' },
            { id: '2', sku: 'BETA-002',  description: 'Standard widget' },
            { id: '3', sku: 'GAMMA-003', description: 'Special edition' },
          ],
        },
      }],
      adapters: [adapter],
    })
    const bySku = await admin.invoke<ListActionResponse>(searchReq('products', 'BETA'))
    expect(bySku.records.map((r) => r.id)).toEqual(['2'])

    const byDescription = await admin.invoke<ListActionResponse>(
      searchReq('products', 'premium'),
    )
    expect(byDescription.records.map((r) => r.id)).toEqual(['1'])
  })

  test('searches across multiple title-like fields (e.g. firstName + lastName)', async () => {
    // Resources with split human names need to be findable by either part.
    const admin = new ModernAdmin({
      resources: [{
        resource: {
          name: 'people',
          properties: [
            new BaseProperty({ path: 'id', isId: true }),
            new BaseProperty({ path: 'firstName', type: 'string' }),
            new BaseProperty({ path: 'lastName', type: 'string' }),
          ],
          rows: [
            { id: '1', firstName: 'Ada',   lastName: 'Lovelace' },
            { id: '2', firstName: 'Alan',  lastName: 'Turing' },
            { id: '3', firstName: 'Grace', lastName: 'Hopper' },
          ],
        },
      }],
      adapters: [adapter],
    })
    const byFirst = await admin.invoke<ListActionResponse>(searchReq('people', 'Grace'))
    expect(byFirst.records.map((r) => r.id)).toEqual(['3'])

    const byLast = await admin.invoke<ListActionResponse>(searchReq('people', 'Turing'))
    expect(byLast.records.map((r) => r.id)).toEqual(['2'])
  })
})

describe('built-in search action — guards', () => {
  test('does not search password-like fields even when they match', async () => {
    const admin = new ModernAdmin({
      resources: [{
        resource: {
          name: 'admins',
          properties: [
            new BaseProperty({ path: 'id', isId: true }),
            new BaseProperty({ path: 'name', type: 'string' }),
            new BaseProperty({ path: 'password', type: 'string' }),
          ],
          rows: [
            { id: '1', name: 'Ada', password: 'secret-ada' },
            { id: '2', name: 'Bob', password: 'secret-bob' },
          ],
        },
      }],
      adapters: [adapter],
    })
    const res = await admin.invoke<ListActionResponse>(searchReq('admins', 'secret'))
    expect(res.records).toHaveLength(0)
  })

  test('deduplicates records when multiple passes match the same row', async () => {
    // The id "ada" appears both inside the name ("Ada Lovelace") and as
    // a substring of the id ("ada-1"); only one hit should be returned.
    const admin = new ModernAdmin({
      resources: [{
        resource: {
          name: 'people',
          properties: [
            new BaseProperty({ path: 'id', isId: true }),
            new BaseProperty({ path: 'name', type: 'string' }),
          ],
          rows: [
            { id: 'ada-1', name: 'Ada Lovelace' },
          ],
        },
      }],
      adapters: [adapter],
    })
    const res = await admin.invoke<ListActionResponse>(searchReq('people', 'ada'))
    expect(res.records).toHaveLength(1)
    expect(res.records[0]!.id).toBe('ada-1')
  })

  test('empty query returns up to 50 records unfiltered', async () => {
    const rows = Array.from({ length: 75 }, (_, i) => ({ id: String(i + 1), name: `Row ${i + 1}` }))
    const admin = new ModernAdmin({
      resources: [{
        resource: {
          name: 'items',
          properties: [
            new BaseProperty({ path: 'id', isId: true }),
            new BaseProperty({ path: 'name', type: 'string' }),
          ],
          rows,
        },
      }],
      adapters: [adapter],
    })
    const res = await admin.invoke<ListActionResponse>(searchReq('items', ''))
    expect(res.records).toHaveLength(50)
  })
})
