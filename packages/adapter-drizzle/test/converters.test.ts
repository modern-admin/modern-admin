import { describe, expect, it } from 'bun:test'
import { Filter } from '@modern-admin/core'
import { DrizzleResource } from '../src/resource.js'
import { filterToWhere, findOptionsToDrizzle } from '../src/converters.js'
import { createFakeClient } from './_helpers/fake-client.js'
import { posts, users } from './_helpers/schema.js'

const makeResource = () => {
  const client = createFakeClient()
  return new DrizzleResource({ client, table: users, tableKey: 'users' })
}

const paramValues = (node: unknown, acc: unknown[] = []): unknown[] => {
  if (node == null || typeof node !== 'object') return acc
  if ('value' in node && 'encoder' in node) {
    acc.push((node as { value: unknown }).value)
    return acc
  }
  const chunks = (node as { queryChunks?: unknown[] }).queryChunks
  if (Array.isArray(chunks)) for (const chunk of chunks) paramValues(chunk, acc)
  return acc
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
    const where = filterToWhere(new Filter({ email: 'foo', role: 'admin' }, resource), users)
    expect(where).toBeDefined()
  })

  it('skips fields whose property is unknown', () => {
    const resource = makeResource()
    const where = filterToWhere(new Filter({ unknownField: 'x' }, resource), users)
    expect(where).toBeUndefined()
  })

  it('handles range inputs via PARAM_SEPARATOR', () => {
    const resource = makeResource()
    const where = filterToWhere(new Filter({ 'age~~from': '10', 'age~~to': '50' }, resource), users)
    expect(where).toBeDefined()
  })

  it('checks only null for empty and non-empty operators on dates', () => {
    const resource = makeResource()
    const empty = filterToWhere(new Filter({ created_at: 'empty:' }, resource), users)
    const nonEmpty = filterToWhere(new Filter({ created_at: 'nempty:' }, resource), users)

    expect(empty).toBeDefined()
    expect(nonEmpty).toBeDefined()
    expect(paramValues(empty)).toEqual([])
    expect(paramValues(nonEmpty)).toEqual([])
  })

  it('keeps empty-string checks for nullable strings', () => {
    const resource = makeResource()
    const empty = filterToWhere(new Filter({ name: 'empty:' }, resource), users)
    const nonEmpty = filterToWhere(new Filter({ name: 'nempty:' }, resource), users)

    expect(paramValues(empty)).toEqual([''])
    expect(paramValues(nonEmpty)).toEqual([''])
  })

  it('uses array-contains for scalar-list columns with a single needle', () => {
    const client = createFakeClient()
    const resource = new DrizzleResource({ client, table: posts, tableKey: 'posts' })
    const where = filterToWhere(new Filter({ tagIds: 'turing' }, resource), posts)
    // Sanity check: the produced SQL fragment is drizzle's `arrayContains`
    // helper, which emits Postgres' `@>` operator on a `text[]` column.
    expect(where).toBeDefined()
    const chunks = (where as { queryChunks?: unknown[] }).queryChunks ?? []
    const stringChunks = chunks
      .filter((c) => typeof c === 'object' && c !== null && 'value' in c)
      .map((c) => (c as { value?: unknown[] }).value?.join(''))
      .join(' ')
    expect(stringChunks).toContain('@>')
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
    const result = findOptionsToDrizzle({ sort: { sortBy: 'email', direction: 'desc' } }, users)
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
