// Verifies that the `sort` option declared on a resource via
// `ResourceOptions.sort` is actually applied as the default order when the
// list action is invoked without an explicit `sortBy` in the query. Covered
// across several fields and both directions so a fix can't accidentally
// hardcode one column.

import { describe, expect, test } from 'bun:test'
import { ModernAdmin } from '../src/modern-admin.js'
import { BaseProperty } from '../src/adapters/base-property.js'
import type { Filter } from '../src/filter/filter.js'
import type { FindOptions } from '../src/adapters/types.js'
import type { ActionRequest, ListActionResponse } from '../src/actions'
import type { Adapter } from '../src/factories/resources-factory.js'
import { FakeDatabase, FakeResource, type FakeTable } from './_helpers/fake-adapter.js'

interface SortedTable extends FakeTable {
  /** Captures the `FindOptions.sort` argument from the last `find()` call. */
  lastSort?: FindOptions['sort']
}

class SortingFakeResource extends FakeResource {
  constructor(private readonly t: SortedTable) {
    super(t)
  }

  override async find(filter: Filter, options: FindOptions) {
    this.t.lastSort = options.sort
    const rows = [...this.t.rows]
    const sortBy = options.sort?.sortBy
    const direction = options.sort?.direction ?? 'asc'
    if (sortBy) {
      rows.sort((a, b) => {
        const av = a[sortBy] as string | number | undefined
        const bv = b[sortBy] as string | number | undefined
        if (av == null && bv == null) return 0
        if (av == null) return direction === 'asc' ? -1 : 1
        if (bv == null) return direction === 'asc' ? 1 : -1
        if (av < bv) return direction === 'asc' ? -1 : 1
        if (av > bv) return direction === 'asc' ? 1 : -1
        return 0
      })
    }
    this.t.rows = rows
    return super.find(filter, options)
  }
}

const adapter = {
  Database: FakeDatabase,
  Resource: SortingFakeResource,
} as unknown as Adapter

const listReq = (resourceId: string, query: Record<string, unknown> = {}): ActionRequest => ({
  params: { resourceId, action: 'list' },
  method: 'get',
  query,
})

const buildAdminWithSort = (
  table: SortedTable,
  sort: { sortBy: string; direction: 'asc' | 'desc' },
) =>
  new ModernAdmin({
    resources: [
      {
        resource: table,
        options: {
          id: table.name,
          sort,
          properties: {
            id: { isSortable: true },
            name: { isSortable: true },
            createdAt: { isSortable: true },
            price: { isSortable: true },
          },
        },
      },
    ],
    adapters: [adapter],
  })

const buildTable = (): SortedTable => ({
  name: 'items',
  properties: [
    new BaseProperty({ path: 'id', isId: true, isSortable: true }),
    new BaseProperty({ path: 'name', type: 'string', isSortable: true }),
    new BaseProperty({ path: 'createdAt', type: 'datetime', isSortable: true }),
    new BaseProperty({ path: 'price', type: 'number', isSortable: true }),
  ],
  rows: [
    { id: '3', name: 'Charlie', createdAt: '2024-03-01', price: 30 },
    { id: '1', name: 'Alice',   createdAt: '2024-01-01', price: 10 },
    { id: '2', name: 'Bob',     createdAt: '2024-02-01', price: 20 },
  ],
})

describe('ResourceOptions.sort — default ordering when query.sortBy is absent', () => {
  test('applies default sort by `name` ascending', async () => {
    const table = buildTable()
    const admin = buildAdminWithSort(table, { sortBy: 'name', direction: 'asc' })
    const res = await admin.invoke<ListActionResponse>(listReq('items'))
    expect(table.lastSort).toEqual({ sortBy: 'name', direction: 'asc' })
    expect(res.records.map((r) => r.params.name)).toEqual(['Alice', 'Bob', 'Charlie'])
  })

  test('applies default sort by `createdAt` descending', async () => {
    const table = buildTable()
    const admin = buildAdminWithSort(table, { sortBy: 'createdAt', direction: 'desc' })
    const res = await admin.invoke<ListActionResponse>(listReq('items'))
    expect(table.lastSort).toEqual({ sortBy: 'createdAt', direction: 'desc' })
    expect(res.records.map((r) => r.params.id)).toEqual(['3', '2', '1'])
  })

  test('applies default sort by numeric `price` ascending', async () => {
    const table = buildTable()
    const admin = buildAdminWithSort(table, { sortBy: 'price', direction: 'asc' })
    const res = await admin.invoke<ListActionResponse>(listReq('items'))
    expect(table.lastSort).toEqual({ sortBy: 'price', direction: 'asc' })
    expect(res.records.map((r) => r.params.price)).toEqual([10, 20, 30])
  })

  test('applies default sort by `id` descending', async () => {
    const table = buildTable()
    const admin = buildAdminWithSort(table, { sortBy: 'id', direction: 'desc' })
    const res = await admin.invoke<ListActionResponse>(listReq('items'))
    expect(table.lastSort).toEqual({ sortBy: 'id', direction: 'desc' })
    expect(res.records.map((r) => r.params.id)).toEqual(['3', '2', '1'])
  })

  test('explicit query.sortBy overrides the resource default', async () => {
    const table = buildTable()
    const admin = buildAdminWithSort(table, { sortBy: 'name', direction: 'asc' })
    const res = await admin.invoke<ListActionResponse>(
      listReq('items', { sortBy: 'price', direction: 'desc' }),
    )
    expect(table.lastSort).toEqual({ sortBy: 'price', direction: 'desc' })
    expect(res.records.map((r) => r.params.price)).toEqual([30, 20, 10])
  })

  test('list response meta exposes the default sort', async () => {
    const table = buildTable()
    const admin = buildAdminWithSort(table, { sortBy: 'name', direction: 'asc' })
    const res = await admin.invoke<ListActionResponse>(listReq('items'))
    expect(res.meta.sortBy).toBe('name')
    expect(res.meta.direction).toBe('asc')
  })
})
