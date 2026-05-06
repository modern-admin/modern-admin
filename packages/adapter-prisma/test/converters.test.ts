import { describe, expect, test } from 'bun:test'
import { Filter } from '@modern-admin/core'
import { filterToWhere, findOptionsToPrisma } from '../src/converters.js'
import { PrismaResource } from '../src/resource.js'
import { userModel } from './_helpers/dmmf.js'
import { createClient, createDelegate } from './_helpers/fake-client.js'

const buildResource = () =>
  new PrismaResource({
    model: userModel,
    client: createClient({ user: createDelegate() }),
  })

describe('filterToWhere', () => {
  test('string fields produce case-insensitive contains clauses', () => {
    const resource = buildResource()
    const filter = new Filter({ email: 'foo@bar' }, resource)
    expect(filterToWhere(filter)).toEqual({
      email: { contains: 'foo@bar', mode: 'insensitive' },
    })
  })

  test('numeric fields coerce strings and emit equals', () => {
    const resource = buildResource()
    const filter = new Filter({ age: '42' }, resource)
    expect(filterToWhere(filter)).toEqual({ age: { equals: 42 } })
  })

  test('range qualifier emits gte/lte and coerces datetime values', () => {
    const resource = buildResource()
    const filter = new Filter(
      { 'createdAt~~from': '2025-01-01', 'createdAt~~to': '2025-12-31' },
      resource,
    )
    const where = filterToWhere(filter)
    expect((where.createdAt as { gte: Date; lte: Date }).gte).toBeInstanceOf(Date)
    expect((where.createdAt as { gte: Date; lte: Date }).lte).toBeInstanceOf(Date)
  })

  test('skips elements without a backing property', () => {
    const resource = buildResource()
    const filter = new Filter({ unknownField: 'x' }, resource)
    expect(filterToWhere(filter)).toEqual({})
  })
})

describe('findOptionsToPrisma', () => {
  test('translates limit/offset/sort', () => {
    expect(
      findOptionsToPrisma({
        limit: 10,
        offset: 20,
        sort: { sortBy: 'email', direction: 'desc' },
      }),
    ).toEqual({ take: 10, skip: 20, orderBy: { email: 'desc' } })
  })

  test('omits unset fields', () => {
    expect(findOptionsToPrisma({})).toEqual({})
  })

  test('default direction is asc', () => {
    expect(findOptionsToPrisma({ sort: { sortBy: 'email' } })).toEqual({
      orderBy: { email: 'asc' },
    })
  })
})
