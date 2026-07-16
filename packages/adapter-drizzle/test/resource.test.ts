import { describe, expect, it } from 'bun:test'
import { bigint as pgBigint, pgTable, text } from 'drizzle-orm/pg-core'
import { Filter } from '@modern-admin/core'
import { DrizzleResource } from '../src/resource.js'
import { createFakeClient } from './_helpers/fake-client.js'
import { users } from './_helpers/schema.js'

const makeResource = (canned = {}) => {
  const client = createFakeClient(canned)
  const resource = new DrizzleResource({ client, table: users, tableKey: 'users' })
  return { client, resource }
}

describe('DrizzleResource construction', () => {
  it('exposes id, databaseName, databaseType', () => {
    const { resource } = makeResource()
    expect(resource.id()).toBe('users')
    expect(resource.databaseName()).toBe('users')
    expect(resource.databaseType()).toBe('drizzle')
  })

  it('throws when the table has no primary key', () => {
    const tableWithoutPk = { col: { name: 'col', dataType: 'string' } } as never
    expect(
      () => new DrizzleResource({ client: createFakeClient(), table: tableWithoutPk, tableKey: 't' }),
    ).toThrow(/primary-key/)
  })

  it('builds property descriptors from columns', () => {
    const { resource } = makeResource()
    const paths = resource.properties().map((p) => p.path())
    expect(paths).toContain('id')
    expect(paths).toContain('email')
    expect(paths).toContain('role')
  })
})

describe('DrizzleResource.find', () => {
  it('forwards limit/offset/orderBy to drizzle', async () => {
    const { client, resource } = makeResource({
      selectRows: [{ id: '1', email: 'a@b.c' }, { id: '2', email: 'd@e.f' }],
    })
    const filter = new Filter({}, resource)
    const records = await resource.find(filter, {
      limit: 10,
      offset: 5,
      sort: { sortBy: 'email', direction: 'asc' },
    })
    expect(records).toHaveLength(2)
    const ops = client.calls.map((c) => c.op)
    expect(ops).toContain('select')
    expect(ops).toContain('from')
    expect(ops).toContain('orderBy')
    expect(ops).toContain('limit')
    expect(ops).toContain('offset')
    expect(client.calls.find((c) => c.op === 'limit')?.arg).toBe(10)
    expect(client.calls.find((c) => c.op === 'offset')?.arg).toBe(5)
  })

  it('omits where when filter is empty', async () => {
    const { client, resource } = makeResource({ selectRows: [] })
    await resource.find(new Filter({}, resource), {})
    expect(client.calls.find((c) => c.op === 'where')).toBeUndefined()
  })

  it('emits where when filter has matching properties', async () => {
    const { client, resource } = makeResource({ selectRows: [] })
    await resource.find(new Filter({ email: 'foo' }, resource), {})
    expect(client.calls.find((c) => c.op === 'where')).toBeDefined()
  })
})

describe('DrizzleResource.findOne', () => {
  it('returns null when no row is returned', async () => {
    const { resource } = makeResource({ selectRows: [] })
    expect(await resource.findOne('missing')).toBeNull()
  })

  it('wraps the row in a BaseRecord', async () => {
    const { resource } = makeResource({
      selectRows: [{ id: '1', email: 'a@b.c', role: 'admin' }],
    })
    const record = await resource.findOne('1')
    expect(record).not.toBeNull()
    expect(record!.get('email')).toBe('a@b.c')
  })
})

describe('DrizzleResource.findMany', () => {
  it('returns empty array for empty id list without calling client', async () => {
    const { client, resource } = makeResource()
    const result = await resource.findMany([])
    expect(result).toEqual([])
    expect(client.calls).toHaveLength(0)
  })

  it('queries when ids are provided', async () => {
    const { client, resource } = makeResource({
      selectRows: [{ id: '1' }, { id: '2' }],
    })
    const result = await resource.findMany(['1', '2'])
    expect(result).toHaveLength(2)
    expect(client.calls.some((c) => c.op === 'where')).toBe(true)
  })
})

describe('DrizzleResource.count', () => {
  it('returns the value column from the count query', async () => {
    const { resource } = makeResource({ countValue: 42 })
    const total = await resource.count(new Filter({}, resource))
    expect(total).toBe(42)
  })
})

describe('DrizzleResource mutations', () => {
  it('create returns the inserted row', async () => {
    const { client, resource } = makeResource({
      insertRow: { id: '1', email: 'a@b.c', role: 'viewer', active: true },
    })
    const created = await resource.create({ id: '1', email: 'a@b.c' })
    expect(created.id).toBe('1')
    expect(client.calls.map((c) => c.op)).toEqual(['insert', 'values', 'returning'])
  })

  it('update sends set + where + returning', async () => {
    const { client, resource } = makeResource({
      updateRow: { id: '1', email: 'new@b.c' },
    })
    const updated = await resource.update('1', { email: 'new@b.c' })
    expect(updated.email).toBe('new@b.c')
    expect(client.calls.map((c) => c.op)).toEqual(['update', 'set', 'where', 'returning'])
  })

  it('delete sends a where clause', async () => {
    const { client, resource } = makeResource()
    await resource.delete('1')
    expect(client.calls.map((c) => c.op)).toEqual(['delete', 'where'])
  })

  it('deleteMany deletes by filter and returns the RETURNING count', async () => {
    const { client, resource } = makeResource({
      deleteRows: [{ id: '1' }, { id: '2' }],
    })
    const removed = await resource.deleteMany(new Filter({ email: 'foo' }, resource))
    expect(removed).toBe(2)
    // One DELETE … WHERE … RETURNING — not a row-by-row sweep.
    expect(client.calls.map((c) => c.op)).toEqual(['delete', 'where', 'returning'])
  })

  it('deleteMany with an empty filter omits the where clause', async () => {
    const { client, resource } = makeResource({ deleteRows: [] })
    const removed = await resource.deleteMany(new Filter({}, resource))
    expect(removed).toBe(0)
    expect(client.calls.map((c) => c.op)).toEqual(['delete', 'returning'])
  })

  it('strips unknown keys from writable params', async () => {
    const { client, resource } = makeResource({ insertRow: { id: '1' } })
    await resource.create({ id: '1', email: 'a@b.c', notAColumn: 'oops' } as never)
    const valuesCall = client.calls.find((c) => c.op === 'values')
    expect(valuesCall).toBeDefined()
    const v = valuesCall!.arg as Record<string, unknown>
    expect('notAColumn' in v).toBe(false)
    expect(v.email).toBe('a@b.c')
  })
})

describe('DrizzleResource.transaction', () => {
  it('runs the function inside the transaction handler', async () => {
    const { resource } = makeResource()
    let ran = false
    const result = await resource.transaction(async () => {
      ran = true
      return 'ok'
    })
    expect(ran).toBe(true)
    expect(result).toBe('ok')
  })
})

describe('DrizzleResource.transaction tx-client propagation', () => {
  const withTxClient = (base: ReturnType<typeof createFakeClient>, tx: ReturnType<typeof createFakeClient>) => {
    let txCalls = 0
    base.transaction = async <T>(fn: (t: typeof tx) => Promise<T>): Promise<T> => {
      txCalls += 1
      return fn(tx)
    }
    return { txCalls: () => txCalls }
  }

  it('operations inside the callback route through the tx client', async () => {
    const base = createFakeClient()
    const tx = createFakeClient({ insertRow: { id: '1' } })
    withTxClient(base, tx)
    const resource = new DrizzleResource({ client: base, table: users, tableKey: 'users' })

    await resource.transaction(async () => {
      await resource.create({ id: '1', email: 'a@b.c' } as never)
      await resource.delete('1')
    })

    const txOps = tx.calls.map((c) => c.op)
    expect(txOps).toContain('insert')
    expect(txOps).toContain('delete')
    expect(base.calls).toHaveLength(0)
  })

  it('other resources on the same client join the transaction (m2m junction case)', async () => {
    const base = createFakeClient()
    const tx = createFakeClient({ insertRow: { id: '1' } })
    withTxClient(base, tx)
    const parent = new DrizzleResource({ client: base, table: users, tableKey: 'users' })
    const junction = new DrizzleResource({ client: base, table: users, tableKey: 'users', id: 'junction' })

    await parent.transaction(async () => {
      await junction.create({ id: 'j1', email: 'x@y.z' } as never)
    })

    expect(tx.calls.map((c) => c.op)).toContain('insert')
    expect(base.calls).toHaveLength(0)
  })

  it('a resource on a different client ignores a foreign transaction', async () => {
    const base = createFakeClient()
    withTxClient(base, createFakeClient())
    const other = createFakeClient({ insertRow: { id: '1' } })
    const resourceA = new DrizzleResource({ client: base, table: users, tableKey: 'users' })
    const resourceB = new DrizzleResource({ client: other, table: users, tableKey: 'users' })

    await resourceA.transaction(async () => {
      await resourceB.create({ id: '1', email: 'a@b.c' } as never)
    })

    expect(other.calls.map((c) => c.op)).toContain('insert')
  })

  it('nested transaction joins the outer one instead of reopening', async () => {
    const base = createFakeClient()
    const tx = createFakeClient({ insertRow: { id: '1' } })
    const counter = withTxClient(base, tx)
    const resource = new DrizzleResource({ client: base, table: users, tableKey: 'users' })

    await resource.transaction(() =>
      resource.transaction(async () => {
        await resource.create({ id: '1', email: 'a@b.c' } as never)
      }),
    )

    expect(counter.txCalls()).toBe(1)
    expect(tx.calls.map((c) => c.op)).toContain('insert')
  })

  it('the tx client is dropped after the transaction resolves', async () => {
    const base = createFakeClient({ insertRow: { id: '2' } })
    const tx = createFakeClient({ insertRow: { id: '1' } })
    withTxClient(base, tx)
    const resource = new DrizzleResource({ client: base, table: users, tableKey: 'users' })

    await resource.transaction(async () => {
      await resource.create({ id: '1', email: 'a@b.c' } as never)
    })
    await resource.create({ id: '2', email: 'd@e.f' } as never)

    expect(tx.calls.map((c) => c.op)).toContain('insert')
    expect(base.calls.map((c) => c.op)).toContain('insert')
  })
})

describe('DrizzleResource id casting', () => {
  const bigItems = pgTable('big_items', {
    id: pgBigint('id', { mode: 'bigint' }).primaryKey(),
    name: text('name'),
  }) as unknown as import('../src/types.js').DrizzleTable

  /** Collect drizzle Param values embedded in a SQL condition tree. */
  const paramValues = (node: unknown, acc: unknown[] = []): unknown[] => {
    if (node == null || typeof node !== 'object') return acc
    if ('value' in node && 'encoder' in node) {
      acc.push((node as { value: unknown }).value)
      return acc
    }
    const chunks = (node as { queryChunks?: unknown[] }).queryChunks
    if (Array.isArray(chunks)) for (const c of chunks) paramValues(c, acc)
    return acc
  }

  it('BigInt ids round-trip through BigInt without precision loss above 2^53', async () => {
    const client = createFakeClient({ selectRows: [] })
    const resource = new DrizzleResource({ client, table: bigItems, tableKey: 'bigItems' })

    await resource.findOne('9007199254740993') // 2^53 + 1 — not representable as a JS number

    const where = client.calls.find((c) => c.op === 'where')!.arg
    const params = paramValues(where)
    expect(params).toHaveLength(1)
    expect(typeof params[0]).toBe('bigint')
    expect(params[0]).toBe(BigInt('9007199254740993'))
  })

  it('non-numeric ids on a bigint column pass through unchanged', async () => {
    const client = createFakeClient({ selectRows: [] })
    const resource = new DrizzleResource({ client, table: bigItems, tableKey: 'bigItems' })

    await resource.findOne('not-a-number')

    const params = paramValues(client.calls.find((c) => c.op === 'where')!.arg)
    expect(params).toEqual(['not-a-number'])
  })
})

describe('DrizzleResource.aggregateTimeSeries', () => {
  const tsQuery = {
    dateField: 'createdAt',
    step: 'week' as const,
    metric: 'count' as const,
    from: new Date('2026-01-01T00:00:00Z'),
    to: new Date('2026-01-31T00:00:00Z'),
  }

  it('maps SQL bucket values to canonical YYYY-MM-DD keys', async () => {
    const { resource } = makeResource({
      selectRows: [
        { bucket: new Date('2026-01-05T00:00:00Z'), value: 3 }, // pg DATE_TRUNC → Date
        { bucket: '2026-01-12', value: '2' }, // mysql/sqlite → date string, count as string
      ],
    })
    const result = await resource.aggregateTimeSeries(new Filter({}, resource), tsQuery)
    const total = result.series.find((s) => s.key === '__total__')!
    expect(total.points).toEqual([
      { date: '2026-01-05', value: 3 },
      { date: '2026-01-12', value: 2 },
    ])
  })

  it('skips NULL-valued buckets so all-NULL aggregates match the Prisma adapter', async () => {
    const { resource } = makeResource({
      selectRows: [
        { bucket: '2026-01-05', value: 4 },
        { bucket: '2026-01-12', value: null }, // SUM/AVG over all-NULL rows
      ],
    })
    const result = await resource.aggregateTimeSeries(new Filter({}, resource), tsQuery)
    const total = result.series.find((s) => s.key === '__total__')!
    expect(total.points).toEqual([{ date: '2026-01-05', value: 4 }])
  })

  it('drops rows with unparseable bucket values instead of throwing', async () => {
    const { resource } = makeResource({
      selectRows: [
        { bucket: '2026-W02', value: 5 }, // legacy week-label format
        { bucket: '2026-01-12', value: 1 },
      ],
    })
    const result = await resource.aggregateTimeSeries(new Filter({}, resource), tsQuery)
    const total = result.series.find((s) => s.key === '__total__')!
    expect(total.points).toEqual([{ date: '2026-01-12', value: 1 }])
  })
})
