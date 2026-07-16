import { describe, expect, it } from 'bun:test'
import { MemoryHistoryStore } from '../src/system/memory.js'

const append = (store: MemoryHistoryStore, recordId: string, name: string) =>
  store.append({ resourceId: 'users', recordId, op: 'update', snapshot: { name } })

describe('MemoryHistoryStore retention', () => {
  it('keeps everything when no policy is configured', async () => {
    const store = new MemoryHistoryStore()
    for (let i = 0; i < 5; i++) await append(store, '1', `n${i}`)
    expect(store.entries).toHaveLength(5)
  })

  it('keepLast trims to the newest N revisions per record on append', async () => {
    const store = new MemoryHistoryStore({ keepLast: 2 })
    for (let i = 0; i < 5; i++) await append(store, '1', `n${i}`)
    expect(store.entries).toHaveLength(2)
    const names = store.entries.map((e) => e.snapshot.name).sort()
    expect(names).toEqual(['n3', 'n4'])
  })

  it('keepLast is scoped per record', async () => {
    const store = new MemoryHistoryStore({ keepLast: 1 })
    await append(store, '1', 'a1')
    await append(store, '1', 'a2')
    await append(store, '2', 'b1')
    await append(store, '2', 'b2')
    expect(store.entries).toHaveLength(2)
    expect(store.entries.map((e) => e.snapshot.name).sort()).toEqual(['a2', 'b2'])
  })

  it('prune(keepDays) drops revisions older than the cutoff', async () => {
    const store = new MemoryHistoryStore()
    await append(store, '1', 'old')
    await append(store, '1', 'fresh')
    // Age the first entry past the cutoff.
    const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    ;(store.entries[0] as { createdAt: string }).createdAt = old

    const removed = await store.prune({ keepDays: 7 })
    expect(removed).toBe(1)
    expect(store.entries).toHaveLength(1)
    expect(store.entries[0]!.snapshot.name).toBe('fresh')
  })

  it('prune returns 0 when nothing is out of policy', async () => {
    const store = new MemoryHistoryStore()
    await append(store, '1', 'a')
    expect(await store.prune({ keepLast: 5, keepDays: 30 })).toBe(0)
    expect(store.entries).toHaveLength(1)
  })
})
