import { describe, expect, test } from 'bun:test'
import { MemoryLogStore } from '../src/system/memory.js'

describe('MemoryLogStore paging', () => {
  test('assigns ids and pages through entries with equal timestamps', async () => {
    const store = new MemoryLogStore()
    for (let i = 0; i < 60; i++) {
      store.record({ resourceId: 'users', action: 'edit', recordId: String(i), at: 1_000 })
    }

    const seen: string[] = []
    let cursor: { before: number; beforeId: string } | undefined
    for (let guard = 0; guard < 10; guard++) {
      const page = await store.list({ limit: 25, ...(cursor ?? {}) })
      if (page.length === 0) break
      seen.push(...page.map((entry) => entry.id!))
      const last = page.at(-1)!
      cursor = { before: last.at, beforeId: last.id! }
    }

    expect(seen).toHaveLength(60)
    expect(new Set(seen).size).toBe(60)
  })
})
