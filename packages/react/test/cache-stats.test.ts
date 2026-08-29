import { describe, expect, test } from 'bun:test'
import type { CacheStatsResponse } from '../src/client.js'
import { clearCacheStatsEntries } from '../src/hooks.js'

describe('clearCacheStatsEntries', () => {
  test('clears counters immediately while preserving runtime state', () => {
    const stats: CacheStatsResponse = {
      instanceId: 'replica-1',
      dirtyTags: ['list:users'],
      inFlight: 2,
      entries: [
        {
          namespace: 'list',
          resourceId: 'users',
          hits: 4,
          misses: 1,
          bypasses: 0,
          sets: 1,
          skippedWrites: 0,
          computes: 1,
          computeMs: 12,
          coalesced: 0,
          readErrors: 0,
          writeErrors: 0,
          invalidations: 0,
          invalidationErrors: 0,
          lockWaits: 0,
        },
      ],
    }

    expect(clearCacheStatsEntries(stats)).toEqual({
      instanceId: 'replica-1',
      dirtyTags: ['list:users'],
      inFlight: 2,
      entries: [],
    })
    expect(stats.entries).toHaveLength(1)
  })
})
