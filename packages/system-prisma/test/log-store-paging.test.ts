// `IQueryableLogStore.list({ before })` is the keyset cursor the audit log's
// "load more" pages on. `MemoryLogStore` honoured it; `PrismaLogStore` dropped
// it, so every extra page re-fetched the first one and the UI never advanced.
// The unbounded default is the other half: the audit log is append-only, so a
// `list()` with no `limit` was a full-table SELECT.

import { describe, expect, it } from 'bun:test'
import { setupPrismaSystem } from '../src/index.js'
import { fakePrisma } from './_fake-prisma.js'

const seed = async (count: number) => {
  const prisma = fakePrisma()
  const { logStore } = setupPrismaSystem(prisma as never)
  const base = 1_700_000_000_000
  for (let i = 0; i < count; i++) {
    await logStore.record({ resourceId: 'users', action: 'edit', recordId: String(i), at: base + i })
  }
  return { logStore, base }
}

describe('PrismaLogStore paging', () => {
  it('honours the `before` cursor', async () => {
    const { logStore, base } = await seed(5)
    const all = await logStore.list()
    expect(all.map((e) => e.at)).toEqual([base + 4, base + 3, base + 2, base + 1, base])

    const next = await logStore.list({ before: base + 2 })
    expect(next.map((e) => e.at)).toEqual([base + 1, base])
  })

  it('paging with `before` terminates instead of repeating the first page', async () => {
    const { logStore } = await seed(7)
    const seen: number[] = []
    let cursor: number | undefined
    for (let guard = 0; guard < 10; guard++) {
      const page = await logStore.list({ limit: 3, ...(cursor !== undefined ? { before: cursor } : {}) })
      if (page.length === 0) break
      seen.push(...page.map((e) => e.at))
      cursor = page[page.length - 1]!.at
    }
    expect(seen).toHaveLength(7)
    expect(new Set(seen).size).toBe(7)
  })

  it('combines `before` with a `from` bound rather than overwriting it', async () => {
    const { logStore, base } = await seed(6)
    const page = await logStore.list({ from: new Date(base + 2), before: base + 5 })
    expect(page.map((e) => e.at)).toEqual([base + 4, base + 3, base + 2])
  })

  it('defaults to a bounded page instead of the whole table', async () => {
    const { logStore } = await seed(60)
    expect(await logStore.list()).toHaveLength(50)
    expect(await logStore.list({ limit: 60 })).toHaveLength(60)
  })
})
