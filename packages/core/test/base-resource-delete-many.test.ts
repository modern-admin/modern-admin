import { describe, expect, test } from 'bun:test'
import {
  BaseProperty,
  BaseRecord,
  BaseResource,
  Filter,
  type FindOptions,
  type ParamsType,
} from '../src'

// Minimal in-memory resource exercising the default `BaseResource.deleteMany`
// (pagination + bounded-concurrency chunking + per-row failure isolation).
class MemResource extends BaseResource {
  rows: Array<Record<string, unknown>>
  /** ids whose `delete` should throw, to verify failures don't abort the sweep. */
  failIds = new Set<string>()
  /** running / peak concurrent `delete` calls, to verify chunking. */
  private inFlight = 0
  peakInFlight = 0

  constructor(rows: Array<Record<string, unknown>>) {
    super()
    this.rows = rows
  }
  override id(): string { return 'mem' }
  override databaseName(): string { return 'mem' }
  override properties(): BaseProperty[] {
    return [new BaseProperty({ path: 'id', isId: true })]
  }
  override async count(): Promise<number> { return this.rows.length }
  override async find(_filter: Filter, options: FindOptions): Promise<BaseRecord[]> {
    const offset = options.offset ?? 0
    const limit = options.limit ?? this.rows.length
    return this.rows.slice(offset, offset + limit).map((r) => new BaseRecord(r, this))
  }
  override async findOne(id: string): Promise<BaseRecord | null> {
    const row = this.rows.find((r) => String(r.id) === id)
    return row ? new BaseRecord(row, this) : null
  }
  override async findMany(ids: Array<string | number>): Promise<BaseRecord[]> {
    const set = new Set(ids.map(String))
    return this.rows.filter((r) => set.has(String(r.id))).map((r) => new BaseRecord(r, this))
  }
  override async create(params: ParamsType): Promise<ParamsType> {
    this.rows.push(params)
    return params
  }
  override async update(id: string, params: ParamsType): Promise<ParamsType> {
    return { id, ...params }
  }
  override async delete(id: string): Promise<void> {
    this.inFlight += 1
    this.peakInFlight = Math.max(this.peakInFlight, this.inFlight)
    // Yield a turn so overlapping deletes are observable.
    await Promise.resolve()
    try {
      if (this.failIds.has(id)) throw new Error(`boom ${id}`)
      const idx = this.rows.findIndex((r) => String(r.id) === id)
      if (idx >= 0) this.rows.splice(idx, 1)
    } finally {
      this.inFlight -= 1
    }
  }
}

const makeRows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i) }))
const filterFor = (r: BaseResource) => new Filter(undefined, r)

describe('BaseResource.deleteMany (default impl)', () => {
  test('paginates past a single page and deletes every matching row', async () => {
    const resource = new MemResource(makeRows(2300))
    const removed = await resource.deleteMany(filterFor(resource), { pageSize: 500 })
    expect(removed).toBe(2300)
    expect(resource.rows).toHaveLength(0)
  })

  test('bounds delete concurrency to the chunk size', async () => {
    const resource = new MemResource(makeRows(50))
    await resource.deleteMany(filterFor(resource), { concurrency: 5 })
    expect(resource.peakInFlight).toBeLessThanOrEqual(5)
    expect(resource.rows).toHaveLength(0)
  })

  test('isolates a failing delete: sweep continues, count reflects successes', async () => {
    const resource = new MemResource(makeRows(10))
    resource.failIds.add('3')
    resource.failIds.add('7')
    const removed = await resource.deleteMany(filterFor(resource), { concurrency: 4 })
    expect(removed).toBe(8)
    // The two failing rows survive; everything else is gone.
    expect(resource.rows.map((r) => r.id).sort()).toEqual(['3', '7'])
  })
})
