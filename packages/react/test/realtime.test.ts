import { describe, expect, test } from 'bun:test'
import { applyDeletionLocally } from '../src/realtime.js'

interface FakeQueryClient {
  setQueriesData<T>(filter: { queryKey: unknown[] }, updater: (data: unknown) => T): void
}

const makeClient = (
  initial: Record<string, unknown>,
): { client: FakeQueryClient; data: Record<string, unknown> } => {
  const data = { ...initial }
  const client: FakeQueryClient = {
    setQueriesData(filter, updater) {
      const key = JSON.stringify(filter.queryKey)
      data[key] = updater(data[key])
    },
  }
  return { client, data }
}

describe('applyDeletionLocally', () => {
  test('removes the matching record and decrements meta.total', () => {
    const key = JSON.stringify(['modern-admin', 'users', 'list'])
    const { client, data } = makeClient({
      [key]: {
        records: [
          { id: '1', email: 'a' },
          { id: '2', email: 'b' },
        ],
        meta: { total: 2 },
      },
    })
    applyDeletionLocally(client as never, 'users', '1')
    expect(data[key]).toEqual({
      records: [{ id: '2', email: 'b' }],
      meta: { total: 1 },
    })
  })

  test('returns input untouched when record id not present', () => {
    const key = JSON.stringify(['modern-admin', 'users', 'list'])
    const original = {
      records: [{ id: '2', email: 'b' }],
      meta: { total: 1 },
    }
    const { client, data } = makeClient({ [key]: original })
    applyDeletionLocally(client as never, 'users', '99')
    expect(data[key]).toBe(original)
  })

  test('returns input untouched when no records array', () => {
    const key = JSON.stringify(['modern-admin', 'users', 'list'])
    const original = { records: undefined }
    const { client, data } = makeClient({ [key]: original })
    applyDeletionLocally(client as never, 'users', '1')
    expect(data[key]).toBe(original)
  })

  test('clamps total at zero', () => {
    const key = JSON.stringify(['modern-admin', 'users', 'list'])
    const { client, data } = makeClient({
      [key]: {
        records: [{ id: '1' }],
        meta: { total: 0 },
      },
    })
    applyDeletionLocally(client as never, 'users', '1')
    const result = data[key] as { meta: { total: number } }
    expect(result.meta.total).toBe(0)
  })
})
