import { describe, expect, it } from 'bun:test'
import { MemoryLogStore } from '../src/system/memory.js'

describe('MemoryLogStore retention', () => {
  it('keeps the newest entries globally', async () => {
    const store = new MemoryLogStore()
    for (let index = 0; index < 5; index++) {
      store.record({ resourceId: 'users', action: 'edit', at: index })
    }

    expect(await store.prune({ keepLast: 2 })).toBe(3)
    expect((await store.list()).map((entry) => entry.at)).toEqual([4, 3])
  })

  it('drops entries older than keepDays', async () => {
    const store = new MemoryLogStore()
    const day = 24 * 60 * 60 * 1000
    store.record({ resourceId: 'users', action: 'edit', at: Date.now() - 10 * day })
    store.record({ resourceId: 'users', action: 'edit', at: Date.now() })

    expect(await store.prune({ keepDays: 7 })).toBe(1)
    expect(await store.list()).toHaveLength(1)
  })

  it('combines age and count bounds', async () => {
    const store = new MemoryLogStore()
    const day = 24 * 60 * 60 * 1000
    store.record({ resourceId: 'users', action: 'edit', at: Date.now() - 10 * day })
    store.record({ resourceId: 'users', action: 'edit', at: Date.now() - day })
    store.record({ resourceId: 'users', action: 'edit', at: Date.now() })

    expect(await store.prune({ keepDays: 7, keepLast: 1 })).toBe(2)
    expect(await store.list()).toHaveLength(1)
  })
})
