// Hand-rolled fake of the bits of a Prisma model delegate the stores use.
//
// Each FakeDelegate keeps an in-memory array of rows and implements the
// methods our stores call: findMany, findUnique, findFirst, create,
// update, upsert, delete, deleteMany, count. Behaviour mirrors Prisma's
// semantics closely enough that the same store code path runs end-to-end
// against this fake — without pulling Prisma, a generator, or a database
// into the test suite.

import { uuidv7 } from '@modern-admin/core'



type Where = Record<string, any>

const matches = (row: any, where: Where | undefined): boolean => {
  if (!where) return true
  for (const [k, v] of Object.entries(where)) {
    // composite-key shortcut, e.g. { scope_scopeId_key: { ... } }
    if (k.includes('_') && typeof v === 'object' && v !== null && !('in' in v) && !('gte' in v) && !('lte' in v) && !('lt' in v) && !('gt' in v)) {
      for (const [ck, cv] of Object.entries(v)) {
        if (row[ck] !== cv) return false
      }
      continue
    }
    if (v !== null && typeof v === 'object') {
      if ('in' in v && Array.isArray(v.in) && !v.in.includes(row[k])) return false
      if ('gte' in v && !(row[k] >= v.gte)) return false
      if ('lte' in v && !(row[k] <= v.lte)) return false
      if ('gt' in v && !(row[k] > v.gt)) return false
      if ('lt' in v && !(row[k] < v.lt)) return false
      continue
    }
    if (row[k] !== v) return false
  }
  return true
}

const sortRows = (rows: any[], orderBy: any): any[] => {
  if (!orderBy) return rows
  const orders = Array.isArray(orderBy) ? orderBy : [orderBy]
  const compare = (a: any, b: any): number => {
    for (const o of orders) {
      const [field, dir] = Object.entries(o)[0]!
      const av = a[field]
      const bv = b[field]
      if (av === bv) continue
      const cmp = av < bv ? -1 : 1
      return dir === 'desc' ? -cmp : cmp
    }
    return 0
  }
  return rows.slice().sort(compare)
}

export class FakeDelegate {
  public rows: any[] = []

  constructor(private readonly defaults: () => Record<string, any> = () => ({})) {}

  async findMany(args: any = {}): Promise<any[]> {
    let rows = this.rows.filter((r) => matches(r, args.where))
    if (args.orderBy) rows = sortRows(rows, args.orderBy)
    if (typeof args.skip === 'number') rows = rows.slice(args.skip)
    if (typeof args.take === 'number') rows = rows.slice(0, args.take)
    return rows.map((r) => ({ ...r }))
  }
  async findUnique(args: { where: any }): Promise<any | null> {
    const row = this.rows.find((r) => matches(r, args.where))
    return row ? { ...row } : null
  }
  async findFirst(args: any = {}): Promise<any | null> {
    let rows = this.rows.filter((r) => matches(r, args.where))
    if (args.orderBy) rows = sortRows(rows, args.orderBy)
    return rows[0] ? { ...rows[0] } : null
  }
  async create(args: { data: any }): Promise<any> {
    const row = {
      id: args.data.id ?? uuidv7(),
      ...this.defaults(),
      ...args.data,
    }
    if (!('createdAt' in row)) row.createdAt = new Date()
    if (!('updatedAt' in row)) row.updatedAt = new Date()
    this.rows.push(row)
    return { ...row }
  }
  async update(args: { where: any; data: any }): Promise<any> {
    const idx = this.rows.findIndex((r) => matches(r, args.where))
    if (idx < 0) throw new Error('not found')
    const next = { ...this.rows[idx], ...args.data, updatedAt: new Date() }
    this.rows[idx] = next
    return { ...next }
  }
  async upsert(args: { where: any; update: any; create: any }): Promise<any> {
    const idx = this.rows.findIndex((r) => matches(r, args.where))
    if (idx < 0) return this.create({ data: args.create })
    return this.update({ where: args.where, data: args.update })
  }
  async delete(args: { where: any }): Promise<any> {
    const idx = this.rows.findIndex((r) => matches(r, args.where))
    if (idx < 0) throw new Error('not found')
    const [removed] = this.rows.splice(idx, 1)
    return { ...removed }
  }
  async deleteMany(args: { where?: any } = {}): Promise<{ count: number }> {
    const before = this.rows.length
    this.rows = this.rows.filter((r) => !matches(r, args.where))
    return { count: before - this.rows.length }
  }
  async count(args: any = {}): Promise<number> {
    return this.rows.filter((r) => matches(r, args.where)).length
  }
}

/** Build a fake Prisma client with all delegates the stores expect. */
export function fakePrisma() {
  return {
    maLog: new FakeDelegate(() => ({
      recordId: null, recordIds: null, userId: null, payload: null, result: null,
    })),
    maWebhook: new FakeDelegate(() => ({ secret: null, headers: {}, enabled: true })),
    maWebhookDelivery: new FakeDelegate(() => ({
      responseStatus: null, responseBody: null, error: null, attempt: 1, deliveredAt: null,
    })),
    maConfig: new FakeDelegate(),
    maHistory: new FakeDelegate(() => ({ userId: null })),
    maAiTask: new FakeDelegate(() => ({
      resourceId: null, recordId: null, userId: null, output: null,
      error: null, startedAt: null, finishedAt: null, progress: null,
    })),
    maAiTaskEvent: new FakeDelegate(),
    maCache: new FakeDelegate(() => ({ tags: [], expiresAt: null })),
  }
}
