import { describe, expect, test } from 'bun:test'
import { Filter, ValidationError } from '@modern-admin/core'
import { PrismaResource } from '../src/resource.js'
import type { DmmfModel, PrismaClientLike } from '../src/types.js'
import { postModel, userModel, roleEnum } from './_helpers/dmmf.js'
import { createClient, createDelegate, type FakeDelegate } from './_helpers/fake-client.js'

const buildResource = (
  initial: Array<Record<string, unknown>> = [],
): { resource: PrismaResource; delegate: FakeDelegate } => {
  const delegate = createDelegate(initial)
  const client = createClient({ user: delegate })
  const resource = new PrismaResource({
    model: userModel,
    client,
    enums: [roleEnum],
  })
  return { resource, delegate }
}

const emptyFilter = (resource: PrismaResource) => new Filter(undefined, resource)

describe('PrismaResource', () => {
  test('id() returns the model name', () => {
    const { resource } = buildResource()
    expect(resource.id()).toBe('User')
    expect(resource.databaseType()).toBe('prisma')
  })

  test('properties are derived from DMMF', () => {
    const { resource } = buildResource()
    const paths = resource.properties().map((p) => p.path())
    expect(paths).toEqual(['id', 'email', 'age', 'role', 'createdAt', 'posts'])
  })

  test('count delegates to Prisma with the where clause', async () => {
    const { resource, delegate } = buildResource([
      { id: '1', email: 'a@x' },
      { id: '2', email: 'b@y' },
    ])
    expect(await resource.count(emptyFilter(resource))).toBe(2)
    expect(delegate.calls.at(-1)?.method).toBe('count')
  })

  test('find applies pagination and returns BaseRecords', async () => {
    const { resource } = buildResource([
      { id: '1', email: 'a@x' },
      { id: '2', email: 'b@y' },
      { id: '3', email: 'c@z' },
    ])
    const recs = await resource.find(emptyFilter(resource), { limit: 2, offset: 1 })
    expect(recs).toHaveLength(2)
    expect(recs[0]!.id()).toBe('2')
  })

  test('findOne returns null when row missing', async () => {
    const { resource } = buildResource([{ id: '1', email: 'a@x' }])
    expect(await resource.findOne('missing')).toBeNull()
    const rec = await resource.findOne('1')
    expect(rec?.id()).toBe('1')
  })

  test('findMany filters by id list', async () => {
    const { resource } = buildResource([
      { id: '1' },
      { id: '2' },
      { id: '3' },
    ])
    const recs = await resource.findMany(['1', '3'])
    expect(recs.map((r) => r.id()).sort()).toEqual(['1', '3'])
  })

  test('create strips relations and read-only fields', async () => {
    const { resource, delegate } = buildResource()
    await resource.create({
      email: 'new@x',
      role: 'EDITOR',
      posts: [{ title: 'ignored' }],
    })
    const args = delegate.calls.at(-1)?.args as { data: Record<string, unknown> }
    expect(args.data).not.toHaveProperty('posts')
    expect(args.data.email).toBe('new@x')
  })

  test('create preserves scalar foreign-key fields that back relations', async () => {
    const delegate = createDelegate()
    const client = createClient({ post: delegate })
    const resource = new PrismaResource({
      model: postModel,
      client,
      enums: [roleEnum],
    })
    await resource.create({
      title: 'Hello',
      authorId: 'user-42',
    })
    const args = delegate.calls.at(-1)?.args as { data: Record<string, unknown> }
    expect(args.data.authorId).toBe('user-42')
  })

  test('update routes through delegate.update with idClause', async () => {
    const { resource, delegate } = buildResource([{ id: '1', email: 'a@x' }])
    await resource.update('1', { email: 'b@x' })
    const args = delegate.calls.at(-1)?.args as { where: Record<string, unknown> }
    expect(args.where).toEqual({ id: '1' })
  })

  test('delete calls delegate.delete with id clause', async () => {
    const { resource, delegate } = buildResource([{ id: '1' }])
    await resource.delete('1')
    expect(delegate.calls.at(-1)?.method).toBe('delete')
    expect(delegate.rows).toHaveLength(0)
  })

  test('deleteMany issues one deleteMany and returns the removed count', async () => {
    const { resource, delegate } = buildResource([
      { id: '1', email: 'a@x' },
      { id: '2', email: 'b@x' },
      { id: '3', email: 'c@x' },
    ])
    const removed = await resource.deleteMany(emptyFilter(resource))
    expect(removed).toBe(3)
    expect(delegate.rows).toHaveLength(0)
    // Single bulk statement — not one delegate.delete per row.
    expect(delegate.calls.filter((c) => c.method === 'deleteMany')).toHaveLength(1)
    expect(delegate.calls.some((c) => c.method === 'delete')).toBe(false)
  })

  test('P2002 unique violation becomes ValidationError', async () => {
    const { resource, delegate } = buildResource()
    delegate.nextError = Object.assign(new Error('Unique'), {
      code: 'P2002',
      meta: { target: ['email'] },
    })
    await expect(resource.create({ email: 'dup@x' })).rejects.toBeInstanceOf(ValidationError)
  })
})

describe('PrismaResource.transaction', () => {
  const buildTxClient = (
    baseDelegates: Record<string, FakeDelegate>,
    txDelegates: Record<string, FakeDelegate>,
  ): PrismaClientLike & { txCalls: number } => {
    const client = {
      ...baseDelegates,
      txCalls: 0,
      async $transaction<T>(fn: (tx: PrismaClientLike) => Promise<T>): Promise<T> {
        client.txCalls += 1
        return fn(txDelegates as unknown as PrismaClientLike)
      },
    } as PrismaClientLike & { txCalls: number } & Record<string, unknown>
    return client
  }

  test('operations inside the callback route through the tx client', async () => {
    const baseDelegate = createDelegate()
    const txDelegate = createDelegate()
    const client = buildTxClient({ user: baseDelegate }, { user: txDelegate })
    const resource = new PrismaResource({ model: userModel, client, enums: [roleEnum] })

    await resource.transaction(async () => {
      await resource.create({ email: 'a@x' })
      await resource.delete('1')
    })

    expect(txDelegate.calls.map((c) => c.method)).toEqual(['create', 'delete'])
    expect(baseDelegate.calls).toHaveLength(0)
  })

  test('other resources on the same client join the transaction (m2m junction case)', async () => {
    const baseUser = createDelegate()
    const basePost = createDelegate()
    const txUser = createDelegate()
    const txPost = createDelegate()
    const client = buildTxClient({ user: baseUser, post: basePost }, { user: txUser, post: txPost })
    const parent = new PrismaResource({ model: userModel, client, enums: [roleEnum] })
    const junction = new PrismaResource({ model: postModel, client, enums: [roleEnum] })

    await parent.transaction(async () => {
      await junction.create({ title: 'Hello', authorId: '1' })
    })

    expect(txPost.calls.map((c) => c.method)).toEqual(['create'])
    expect(basePost.calls).toHaveLength(0)
  })

  test('a resource on a different client ignores a foreign transaction', async () => {
    const txUser = createDelegate()
    const clientA = buildTxClient({ user: createDelegate() }, { user: txUser })
    const otherDelegate = createDelegate()
    const clientB = createClient({ post: otherDelegate })
    const resourceA = new PrismaResource({ model: userModel, client: clientA, enums: [roleEnum] })
    const resourceB = new PrismaResource({ model: postModel, client: clientB, enums: [roleEnum] })

    await resourceA.transaction(async () => {
      await resourceB.create({ title: 'Hello', authorId: '1' })
    })

    expect(otherDelegate.calls.map((c) => c.method)).toEqual(['create'])
  })

  test('nested transaction joins the outer one instead of reopening', async () => {
    const txDelegate = createDelegate()
    const client = buildTxClient({ user: createDelegate() }, { user: txDelegate })
    const resource = new PrismaResource({ model: userModel, client, enums: [roleEnum] })

    await resource.transaction(() =>
      resource.transaction(async () => {
        await resource.create({ email: 'a@x' })
      }),
    )

    expect(client.txCalls).toBe(1)
    expect(txDelegate.calls.map((c) => c.method)).toEqual(['create'])
  })

  test('the tx client is dropped after the transaction resolves', async () => {
    const baseDelegate = createDelegate()
    const txDelegate = createDelegate()
    const client = buildTxClient({ user: baseDelegate }, { user: txDelegate })
    const resource = new PrismaResource({ model: userModel, client, enums: [roleEnum] })

    await resource.transaction(async () => {
      await resource.create({ email: 'a@x' })
    })
    await resource.create({ email: 'b@x' })

    expect(txDelegate.calls.map((c) => c.method)).toEqual(['create'])
    expect(baseDelegate.calls.map((c) => c.method)).toEqual(['create'])
  })
})

describe('PrismaResource.aggregateTimeSeries', () => {
  const buildTsResource = (
    rows: Array<Record<string, unknown>>,
    timeSeriesRowCap?: number,
  ): { resource: PrismaResource; delegate: FakeDelegate } => {
    const delegate = createDelegate(rows)
    const client = createClient({ user: delegate })
    const resource = new PrismaResource({
      model: userModel,
      client,
      enums: [roleEnum],
      ...(timeSeriesRowCap ? { timeSeriesRowCap } : {}),
    })
    return { resource, delegate }
  }

  const row = (id: string, createdAt: string) => ({ id, email: `${id}@x`, createdAt: new Date(createdAt) })

  test('buckets rows by day and counts them', async () => {
    const { resource } = buildTsResource([
      row('1', '2026-01-01T08:00:00Z'),
      row('2', '2026-01-01T20:00:00Z'),
      row('3', '2026-01-03T09:00:00Z'),
    ])
    const result = await resource.aggregateTimeSeries(new Filter(undefined, resource), {
      dateField: 'createdAt',
      step: 'day',
      metric: 'count',
      from: new Date('2026-01-01T00:00:00Z'),
      to: new Date('2026-01-31T00:00:00Z'),
    })
    expect(result.truncated).toBeUndefined()
    const total = result.series.find((s) => s.key === '__total__')!
    expect(total.points).toEqual([
      { date: '2026-01-01', value: 2 },
      { date: '2026-01-03', value: 1 },
    ])
  })

  test('flags truncated and bounds the scan via take when the cap is exceeded', async () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      row(String(i), `2026-01-0${i + 1}T00:00:00Z`),
    )
    const { resource, delegate } = buildTsResource(rows, 2)
    const result = await resource.aggregateTimeSeries(new Filter(undefined, resource), {
      dateField: 'createdAt',
      step: 'day',
      metric: 'count',
      from: new Date('2026-01-01T00:00:00Z'),
      to: new Date('2026-01-31T00:00:00Z'),
    })
    expect(result.truncated).toBe(true)
    // Requested cap + 1 to detect overflow — never the whole table unbounded.
    const findCall = delegate.calls.find((c) => c.method === 'findMany')!
    expect((findCall.args as { take?: number }).take).toBe(3)
    // Only the capped subset (2 rows, newest-first) is bucketed.
    const total = result.series.reduce((n, s) => n + s.points.reduce((m, p) => m + p.value, 0), 0)
    expect(total).toBe(2)
  })

  test('avg ignores NULL metric values, matching SQL AVG semantics', async () => {
    const { resource } = buildTsResource([
      { id: '1', email: 'a@x', age: 10, createdAt: new Date('2026-01-01T08:00:00Z') },
      { id: '2', email: 'b@x', age: null, createdAt: new Date('2026-01-01T09:00:00Z') },
      { id: '3', email: 'c@x', age: 20, createdAt: new Date('2026-01-01T10:00:00Z') },
    ])
    const result = await resource.aggregateTimeSeries(new Filter(undefined, resource), {
      dateField: 'createdAt',
      step: 'day',
      metric: 'avg',
      field: 'age',
      from: new Date('2026-01-01T00:00:00Z'),
      to: new Date('2026-01-31T00:00:00Z'),
    })
    const total = result.series.find((s) => s.key === '__total__')!
    // (10 + 20) / 2, not (10 + 0 + 20) / 3.
    expect(total.points).toEqual([{ date: '2026-01-01', value: 15 }])
  })
})

describe('PrismaResource id casting', () => {
  const bigModel: DmmfModel = {
    name: 'BigItem',
    fields: [
      {
        name: 'id', kind: 'scalar', type: 'BigInt',
        isList: false, isRequired: true, isUnique: false,
        isId: true, isReadOnly: false, hasDefaultValue: true,
      },
      {
        name: 'name', kind: 'scalar', type: 'String',
        isList: false, isRequired: false, isUnique: false,
        isId: false, isReadOnly: false, hasDefaultValue: false,
      },
    ],
  }

  test('BigInt ids round-trip through BigInt without precision loss above 2^53', async () => {
    const id = BigInt('9007199254740993') // 2^53 + 1 — not representable as a JS number
    const delegate = createDelegate([{ id, name: 'x' }])
    const client = createClient({ bigItem: delegate })
    const resource = new PrismaResource({ model: bigModel, client })

    const record = await resource.findOne('9007199254740993')
    expect(record).not.toBeNull()

    const call = delegate.calls.find((c) => c.method === 'findUnique')!
    const where = (call.args as { where: { id: unknown } }).where
    expect(typeof where.id).toBe('bigint')
    expect(where.id).toBe(id)
  })

  test('non-numeric ids on a BigInt column pass through unchanged', async () => {
    const delegate = createDelegate([])
    const client = createClient({ bigItem: delegate })
    const resource = new PrismaResource({ model: bigModel, client })

    expect(await resource.findOne('not-a-number')).toBeNull()
    const call = delegate.calls.find((c) => c.method === 'findUnique')!
    expect((call.args as { where: { id: unknown } }).where.id).toBe('not-a-number')
  })
})
