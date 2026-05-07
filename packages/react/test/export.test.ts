import { describe, expect, it, mock } from 'bun:test'
import {
  csvEscape,
  exportFilename,
  fetchAllRecords,
  recordsToCsv,
  recordsToJson,
} from '../src/export.js'
import type { AdminClient } from '../src/client.js'
import type { ListResponse, PropertyJSON, RecordJSON } from '../src/types.js'

const rec = (id: string, params: Record<string, unknown>): RecordJSON => ({
  id,
  title: id,
  params,
  populated: {},
  errors: {},
  baseError: null,
})

const prop = (path: string, label = path): PropertyJSON => ({
  path,
  label,
  type: 'string',
  isId: false,
  isSortable: true,
  isRequired: false,
  isDisabled: false,
  isArray: false,
  reference: null,
  availableValues: null,
  components: {},
  visibility: { list: true, show: true, edit: true, filter: true },
  position: 0,
  custom: {},
})

describe('csvEscape', () => {
  it('passes plain values through', () => {
    expect(csvEscape('hello')).toBe('hello')
    expect(csvEscape(42)).toBe('42')
    expect(csvEscape(true)).toBe('true')
  })

  it('returns empty string for null/undefined', () => {
    expect(csvEscape(null)).toBe('')
    expect(csvEscape(undefined)).toBe('')
  })

  it('quotes values with comma, quote, CR, or LF', () => {
    expect(csvEscape('a,b')).toBe('"a,b"')
    expect(csvEscape('he said "hi"')).toBe('"he said ""hi"""')
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"')
  })

  it('serializes objects/arrays as JSON', () => {
    expect(csvEscape({ a: 1 })).toBe('"{""a"":1}"')
    expect(csvEscape([1, 2])).toBe('"[1,2]"')
  })

  it('formats Date as ISO string', () => {
    const d = new Date('2026-05-06T10:00:00Z')
    expect(csvEscape(d)).toBe('2026-05-06T10:00:00.000Z')
  })
})

describe('recordsToCsv', () => {
  it('uses property labels as header and follows path order', () => {
    const out = recordsToCsv(
      [rec('1', { name: 'Alice', age: 30 }), rec('2', { name: 'Bob', age: 40 })],
      { properties: [prop('name', 'Name'), prop('age', 'Age')] },
    )
    const lines = out.replace(/^\uFEFF/, '').split('\r\n')
    expect(lines[0]).toBe('Name,Age')
    expect(lines[1]).toBe('Alice,30')
    expect(lines[2]).toBe('Bob,40')
  })

  it('falls back to union of keys when no properties given', () => {
    const out = recordsToCsv([rec('1', { a: 1 }), rec('2', { b: 2 })])
    const lines = out.replace(/^\uFEFF/, '').split('\r\n')
    expect(lines[0]).toBe('a,b')
    expect(lines[1]).toBe('1,')
    expect(lines[2]).toBe(',2')
  })

  it('emits a UTF-8 BOM for Excel compatibility', () => {
    const out = recordsToCsv([rec('1', { x: 1 })])
    expect(out.charCodeAt(0)).toBe(0xfeff)
  })
})

describe('recordsToJson', () => {
  it('produces an array of {id, ...params}', () => {
    const out = recordsToJson([rec('1', { name: 'Alice' })])
    expect(JSON.parse(out)).toEqual([{ id: '1', name: 'Alice' }])
  })

  it('restricts keys to the given properties', () => {
    const out = recordsToJson(
      [rec('1', { name: 'Alice', secret: 'x' })],
      { properties: [prop('name')] },
    )
    expect(JSON.parse(out)).toEqual([{ id: '1', name: 'Alice' }])
  })
})

describe('fetchAllRecords', () => {
  it('paginates until total is reached', async () => {
    const records = Array.from({ length: 5 }, (_, i) => rec(String(i + 1), { i }))
    const list = mock(async (_id: string, query?: { page?: number; perPage?: number }) => {
      const page = query?.page ?? 1
      const perPage = query?.perPage ?? 2
      const start = (page - 1) * perPage
      const slice = records.slice(start, start + perPage)
      return {
        records: slice,
        meta: { total: records.length, page, perPage },
      } satisfies ListResponse
    })
    const client = { list } as unknown as AdminClient
    const all = await fetchAllRecords(client, 'users', undefined, { batchSize: 2 })
    expect(all).toHaveLength(5)
    expect(list).toHaveBeenCalledTimes(3)
  })

  it('reports progress through onProgress', async () => {
    const list = mock(async () =>
      ({ records: [rec('1', {}), rec('2', {})], meta: { total: 2, page: 1, perPage: 2 } }) satisfies ListResponse,
    )
    const client = { list } as unknown as AdminClient
    const calls: Array<[number, number]> = []
    await fetchAllRecords(client, 'users', undefined, {
      batchSize: 100,
      onProgress: (loaded, total) => calls.push([loaded, total]),
    })
    expect(calls.at(-1)).toEqual([2, 2])
  })

  it('throws AbortError when signal is already aborted', async () => {
    const list = mock(async () =>
      ({ records: [], meta: { total: 0, page: 1, perPage: 1 } }) satisfies ListResponse,
    )
    const client = { list } as unknown as AdminClient
    const ctrl = new AbortController()
    ctrl.abort()
    await expect(
      fetchAllRecords(client, 'users', undefined, { signal: ctrl.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('exportFilename', () => {
  it('builds a stable timestamped filename', () => {
    const d = new Date('2026-05-06T14:30:15Z')
    // Output uses local time — assert on the resource + format suffix only
    // to keep the test stable across runner timezones.
    const name = exportFilename('users', 'csv', d)
    expect(name).toMatch(/^users-\d{8}-\d{6}\.csv$/)
  })
})
