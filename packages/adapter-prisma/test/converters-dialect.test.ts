// `mode: 'insensitive'` is a PostgreSQL/MongoDB-only Prisma feature; MySQL and
// SQLite reject the query outright. `dialect` was accepted by the adapter and
// used only to render display SQL, so every string filter emitted `mode`
// unconditionally and the two non-Postgres dialects were unusable.

import { describe, expect, test } from 'bun:test'
import { Filter } from '@modern-admin/core'
import { filterToWhere } from '../src/converters.js'
import { PrismaResource } from '../src/resource.js'
import { userModel } from './_helpers/dmmf.js'
import { createClient, createDelegate } from './_helpers/fake-client.js'

const buildResource = () =>
  new PrismaResource({
    model: userModel,
    client: createClient({ user: createDelegate() }),
  })

describe('filterToWhere dialect gating', () => {
  test('defaults to postgres and keeps mode: insensitive', () => {
    const filter = new Filter({ email: 'foo@bar' }, buildResource())
    expect(filterToWhere(filter)).toEqual({
      email: { contains: 'foo@bar', mode: 'insensitive' },
    })
  })

  test('mysql omits mode so the query is not rejected', () => {
    const filter = new Filter({ email: 'foo@bar' }, buildResource())
    expect(filterToWhere(filter, 'mysql')).toEqual({ email: { contains: 'foo@bar' } })
  })

  test('sqlite omits mode too', () => {
    const filter = new Filter({ email: 'foo@bar' }, buildResource())
    expect(filterToWhere(filter, 'sqlite')).toEqual({ email: { contains: 'foo@bar' } })
  })

  test('explicit operators are gated as well, not just the implicit branch', () => {
    const resource = buildResource()
    const cases = [
      ['sw', 'startsWith'],
      ['ew', 'endsWith'],
      ['co', 'contains'],
    ] as const
    for (const [op, key] of cases) {
      const filter = new Filter({ email: `${op}:foo` }, resource)
      expect(filterToWhere(filter, 'mysql')).toEqual({ email: { [key]: 'foo' } })
      expect(filterToWhere(filter, 'pg')).toEqual({ email: { [key]: 'foo', mode: 'insensitive' } })
    }
  })

  test('a resource carries its dialect into find()', async () => {
    const delegate = createDelegate()
    const resource = new PrismaResource({
      model: userModel,
      client: createClient({ user: delegate }),
      dialect: 'sqlite',
    })
    await resource.find(new Filter({ email: 'foo' }, resource), {})
    const call = delegate.calls.find((c) => c.method === 'findMany')
    expect((call?.args as { where?: unknown })?.where).toEqual({ email: { contains: 'foo' } })
  })
})
