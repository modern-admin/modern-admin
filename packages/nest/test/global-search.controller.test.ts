// Integration test for `GET /admin/api/global-search`.
//
// Uses a filter-respecting in-memory adapter so the controller's fan-out
// to `ModernAdmin.invoke({action: 'search'})` exercises the real built-in
// search action + Filter pipeline. The default `FakeResource` next door
// ignores filters, which would let broken search code accidentally pass —
// hence the bespoke `SearchableResource` here.

import { describe, expect, test } from 'bun:test'
import {
  BaseDatabase,
  BaseProperty,
  BaseRecord,
  BaseResource,
  Filter,
  ModernAdmin,
  type CurrentAdmin,
  type FindOptions,
  type ParamsType,
} from '@modern-admin/core'
import { GlobalSearchController, type GlobalSearchResponse } from '../src/global-search.controller.js'

interface Row { id: string; [key: string]: unknown }
interface Table {
  name: string
  rows: Row[]
  properties: BaseProperty[]
  options?: { titleProperty?: string }
}

class TestDb extends BaseDatabase {
  constructor(private readonly tables: Table[]) { super(tables) }
  static override isAdapterFor(db: unknown): boolean {
    return Array.isArray(db) && db.every(
      (t) => typeof t === 'object' && t !== null && 'rows' in t && 'properties' in t,
    )
  }
  override resources(): BaseResource[] {
    return this.tables.map((t) => new TestResource(t))
  }
}

class TestResource extends BaseResource {
  constructor(private readonly table: Table) { super() }
  static override isAdapterFor(raw: unknown): boolean {
    return typeof raw === 'object' && raw !== null && 'rows' in raw && 'properties' in raw
  }
  override id(): string { return this.table.name }
  override databaseName(): string { return 'test' }
  override properties(): BaseProperty[] { return this.table.properties }

  private matches(row: Row, filter: Filter): boolean {
    for (const entry of Object.values(filter.filters)) {
      const cell = row[entry.path]
      const needle = entry.value
      if (typeof needle === 'string' && entry.operator === null) {
        if (!String(cell ?? '').toLowerCase().includes(needle.toLowerCase())) return false
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
    return matched.slice(offset, offset + limit).map((r) => new BaseRecord(r, this))
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
    const row = { ...(params as Row), id: String((params as Row).id ?? this.table.rows.length + 1) }
    this.table.rows.push(row)
    return row
  }
  override async update(id: string, params: ParamsType): Promise<ParamsType> {
    const idx = this.table.rows.findIndex((r) => r.id === id)
    if (idx < 0) throw new Error(`row ${id} not found`)
    this.table.rows[idx] = { ...this.table.rows[idx], ...params } as Row
    return this.table.rows[idx]!
  }
  override async delete(id: string): Promise<void> {
    const idx = this.table.rows.findIndex((r) => r.id === id)
    if (idx >= 0) this.table.rows.splice(idx, 1)
  }
}

const adapter = { Database: TestDb, Resource: TestResource } as never

const customersTable = (): Table => ({
  name: 'customers',
  properties: [
    new BaseProperty({ path: 'id', isId: true }),
    new BaseProperty({ path: 'email', type: 'string' }),
  ],
  rows: [
    { id: 'c1', email: 'ada.lovelace@example.com' },
    { id: 'c2', email: 'alan.turing@example.com' },
    { id: 'c3', email: 'grace.hopper@example.com' },
  ],
})

const productsTable = (): Table => ({
  name: 'products',
  properties: [
    new BaseProperty({ path: 'id', isId: true }),
    new BaseProperty({ path: 'sku', type: 'string' }),
    new BaseProperty({ path: 'description', type: 'string' }),
  ],
  rows: [
    { id: 'p1', sku: 'ALPHA-1', description: 'Premium widget — pioneered by Ada' },
    { id: 'p2', sku: 'BETA-2',  description: 'Standard gadget' },
  ],
})

const req = (currentAdmin: CurrentAdmin = { id: 'u1' }) => ({ currentAdmin })

describe('GlobalSearchController', () => {
  test('groups hits per resource for a known term', async () => {
    const admin = new ModernAdmin({
      databases: [[customersTable(), productsTable()]],
      adapters: [adapter],
    })
    const ctrl = new GlobalSearchController(admin)
    const res = (await ctrl.search({ q: 'ada' }, req())) as GlobalSearchResponse
    expect(res.query).toBe('ada')
    expect(res.total).toBeGreaterThan(0)
    const customers = res.groups.find((g) => g.resourceId === 'customers')
    const products = res.groups.find((g) => g.resourceId === 'products')
    expect(customers).toBeDefined()
    expect(customers!.records.map((r) => r.recordId)).toContain('c1')
    // Products group is found because `description` mentions "Ada" — this
    // depends on the fanned-out string-field search added to the action.
    expect(products).toBeDefined()
    expect(products!.records.map((r) => r.recordId)).toContain('p1')
  })

  test('finds records in resources without a default title column', async () => {
    // Products has neither title/name/subject/email — only sku + description.
    // The legacy search action skipped these entirely; verify the fix
    // surfaces them through the global-search palette.
    const admin = new ModernAdmin({
      databases: [[productsTable()]],
      adapters: [adapter],
    })
    const ctrl = new GlobalSearchController(admin)
    const res = (await ctrl.search({ q: 'BETA' }, req())) as GlobalSearchResponse
    expect(res.total).toBeGreaterThan(0)
    const products = res.groups.find((g) => g.resourceId === 'products')
    expect(products).toBeDefined()
    expect(products!.records.map((r) => r.recordId)).toEqual(['p2'])
  })

  test('perResourceLimit caps hits per resource', async () => {
    // Three matching emails containing "example.com"; limit=1 must trim to 1.
    const admin = new ModernAdmin({
      databases: [[customersTable()]],
      adapters: [adapter],
    })
    const ctrl = new GlobalSearchController(admin)
    const res = (await ctrl.search({ q: 'example.com', perResourceLimit: 1 }, req())) as GlobalSearchResponse
    const customers = res.groups.find((g) => g.resourceId === 'customers')
    expect(customers).toBeDefined()
    expect(customers!.records).toHaveLength(1)
  })

  test('rejects empty query with BadRequest (Zod min(1))', async () => {
    const admin = new ModernAdmin({
      databases: [[customersTable()]],
      adapters: [adapter],
    })
    const ctrl = new GlobalSearchController(admin)
    await expect(ctrl.search({ q: '' }, req())).rejects.toThrow()
  })

  test('returns total 0 and empty groups for an unknown term', async () => {
    const admin = new ModernAdmin({
      databases: [[customersTable(), productsTable()]],
      adapters: [adapter],
    })
    const ctrl = new GlobalSearchController(admin)
    const res = (await ctrl.search({ q: 'zzzz_no_such_token' }, req())) as GlobalSearchResponse
    expect(res.total).toBe(0)
    expect(res.groups).toEqual([])
  })
})
