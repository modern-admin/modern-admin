import { describe, expect, it } from 'bun:test'
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
