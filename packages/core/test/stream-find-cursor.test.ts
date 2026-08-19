// `StreamOptions.cursor` is documented as cursor-based pagination, but the
// base implementation paginates by offset and had no reader for it. Silently
// ignoring a resume token restarts from page one, which duplicates every row
// an export or migration has already processed — so it rejects instead.

import { describe, expect, test } from 'bun:test'
import { NotImplementedError } from '../src/errors'
import { Filter } from '../src/filter/filter.js'
import { FakeResource, type FakeTable } from './_helpers/fake-adapter.js'

const table: FakeTable = {
  name: 'items',
  rows: Array.from({ length: 5 }, (_, i) => ({ id: String(i + 1) })),
}

const drain = async (options?: { cursor?: string; pageSize?: number }): Promise<string[]> => {
  const resource = new FakeResource(table)
  const out: string[] = []
  for await (const record of resource.streamFind(new Filter({}, resource), options ?? {})) {
    out.push(String(record.id()))
  }
  return out
}

describe('BaseResource#streamFind', () => {
  test('streams every row when no cursor is given', async () => {
    expect(await drain()).toEqual(['1', '2', '3', '4', '5'])
  })

  test('paginates by offset across several pages', async () => {
    expect(await drain({ pageSize: 2 })).toEqual(['1', '2', '3', '4', '5'])
  })

  test('rejects a cursor rather than silently restarting from the first page', async () => {
    await expect(drain({ cursor: 'opaque-token' })).rejects.toBeInstanceOf(NotImplementedError)
  })
})
