import type { PrismaClientLike, PrismaModelDelegate } from '../../src/types.js'

interface FakeRow {
  [key: string]: unknown
}

interface DelegateCall {
  method: string
  args: unknown
}

export interface FakeDelegate extends PrismaModelDelegate {
  rows: FakeRow[]
  calls: DelegateCall[]
  nextError?: unknown
}

const matchesWhere = (row: FakeRow, where: Record<string, unknown> | undefined): boolean => {
  if (!where) return true
  for (const key of Object.keys(where)) {
    const cond = where[key]
    if (cond == null) continue
    const val = row[key]
    if (typeof cond !== 'object' || cond === null) {
      if (val !== cond) return false
      continue
    }
    const c = cond as Record<string, unknown>
    if ('equals' in c && val !== c.equals) return false
    if ('contains' in c && typeof val === 'string' && typeof c.contains === 'string'
        && !val.toLowerCase().includes(c.contains.toLowerCase())) return false
    if ('in' in c && Array.isArray(c.in) && !c.in.includes(val)) return false
    if ('gte' in c && typeof val === 'number' && typeof c.gte === 'number' && val < c.gte) return false
    if ('lte' in c && typeof val === 'number' && typeof c.lte === 'number' && val > c.lte) return false
  }
  return true
}

export const createDelegate = (initial: FakeRow[] = [], idField = 'id'): FakeDelegate => {
  const rows: FakeRow[] = [...initial]
  const calls: DelegateCall[] = []
  const delegate: FakeDelegate = {
    rows,
    calls,
    async findMany(args: unknown) {
      calls.push({ method: 'findMany', args })
      const a = (args ?? {}) as { where?: Record<string, unknown>; take?: number; skip?: number; orderBy?: Record<string, 'asc' | 'desc'> }
      let result = rows.filter((r) => matchesWhere(r, a.where))
      if (a.orderBy) {
        const [key, dir] = Object.entries(a.orderBy)[0]!
        result = [...result].sort((x, y) => {
          const xv = x[key] as number | string
          const yv = y[key] as number | string
          if (xv === yv) return 0
          return (xv < yv ? -1 : 1) * (dir === 'desc' ? -1 : 1)
        })
      }
      if (a.skip) result = result.slice(a.skip)
      if (a.take != null) result = result.slice(0, a.take)
      return result
    },
    async findUnique(args) {
      calls.push({ method: 'findUnique', args })
      return rows.find((r) => matchesWhere(r, args.where)) ?? null
    },
    async count(args) {
      calls.push({ method: 'count', args })
      return rows.filter((r) => matchesWhere(r, args?.where)).length
    },
    async create(args) {
      calls.push({ method: 'create', args })
      if (delegate.nextError) {
        const e = delegate.nextError
        delegate.nextError = undefined
        throw e
      }
      const row = { ...args.data }
      if (row[idField] == null) row[idField] = String(rows.length + 1)
      rows.push(row)
      return row
    },
    async update(args) {
      calls.push({ method: 'update', args })
      const idx = rows.findIndex((r) => matchesWhere(r, args.where))
      if (idx < 0) throw Object.assign(new Error('not found'), { code: 'P2025' })
      rows[idx] = { ...rows[idx], ...args.data }
      return rows[idx]!
    },
    async delete(args) {
      calls.push({ method: 'delete', args })
      const idx = rows.findIndex((r) => matchesWhere(r, args.where))
      if (idx < 0) throw Object.assign(new Error('not found'), { code: 'P2025' })
      const [removed] = rows.splice(idx, 1)
      return removed!
    },
    async deleteMany(args) {
      calls.push({ method: 'deleteMany', args })
      let count = 0
      for (let i = rows.length - 1; i >= 0; i--) {
        if (matchesWhere(rows[i]!, args?.where)) {
          rows.splice(i, 1)
          count++
        }
      }
      return { count }
    },
  }
  return delegate
}

export const createClient = (
  delegates: Record<string, FakeDelegate>,
): PrismaClientLike & Record<string, FakeDelegate> => {
  const client = {
    ...delegates,
    async $transaction<T>(fn: (tx: PrismaClientLike) => Promise<T>): Promise<T> {
      return fn(client as PrismaClientLike)
    },
  } as PrismaClientLike & Record<string, FakeDelegate>
  return client
}
