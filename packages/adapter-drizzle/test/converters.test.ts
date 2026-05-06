import { describe, expect, it } from 'bun:test'
import { Filter } from '@modern-admin/core'
import { DrizzleResource } from '../src/resource.js'
import { filterToWhere, findOptionsToDrizzle } from '../src/converters.js'
import { createFakeClient } from './_helpers/fake-client.js'
import { users } from './_helpers/schema.js'

const makeResource = () => {
  const client = createFakeClient()
  return new DrizzleResource({ client, table: users, tableKey: 'users' })
}

describe('filterToWhere', () => {
  it('returns undefined for empty filter', () => {
    const resource = makeResource()
    expect(filterToWhere(new Filter({}, resource), users)).toBeUndefined()
  })

  it('produces a single condition for one field', () => {
    const resource = makeResource()
    const where = filterToWhere(new Filter({ email: 'foo' }, resource), users)
    expect(where).toBeDefined()
  })

  it('combines multiple fields with AND', () => {
    const resource = makeResource()
    const where = filterToWhere(
      new Filter({ email: 'foo', role: 'admin' }, resource),
      users,
    )
    expect(where).toBeDefined()
  })

  it('skips fields whose property is unknown', () => {
    const resource = makeResource()
    const where = filterToWhere(new Filter({ unknownField: 'x' }, resource), users)
    expect(where).toBeUndefined()
  })

  it('handles range inputs via PARAM_SEPARATOR', () => {
    const resource = makeResource()
    const where = filterToWhere(
      new Filter({ 'age~~from': '10', 'age~~to': '50' }, resource),
      users,
    )
    expect(where).toBeDefined()
  })
})

describe('findOptionsToDrizzle', () => {
  it('returns empty when no options provided', () => {
    const result = findOptionsToDrizzle({}, users)
    expect(result).toEqual({})
  })

  it('forwards limit and offset', () => {
    const result = findOptionsToDrizzle({ limit: 10, offset: 5 }, users)
    expect(result.limit).toBe(10)
    expect(result.offset).toBe(5)
  })

  it('produces orderBy when sortBy is a known column', () => {
    const result = findOptionsToDrizzle(
      { sort: { sortBy: 'email', direction: 'desc' } },
      users,
    )
    expect(result.orderBy).toBeDefined()
  })

  it('skips orderBy when sortBy is unknown', () => {
    const result = findOptionsToDrizzle(
      { sort: { sortBy: 'nonExistent', direction: 'asc' } },
      users,
    )
    expect(result.orderBy).toBeUndefined()
  })
})
