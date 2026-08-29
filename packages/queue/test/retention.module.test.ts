import { describe, expect, it } from 'bun:test'
import { RetentionModule } from '../src/retention/retention.module.js'

describe('RetentionModule', () => {
  it('rejects invalid retention bounds', () => {
    expect(() =>
      RetentionModule.forRoot({
        history: { store: { prune: async () => 0 }, keepDays: -1 },
      }),
    ).toThrow('history.keepDays must be a non-negative integer')
  })

  it('rejects an empty cron expression', () => {
    expect(() => RetentionModule.forRoot({ cron: ' ' })).toThrow('retention cron must not be empty')
  })
})
