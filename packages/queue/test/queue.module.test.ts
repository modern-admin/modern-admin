import { describe, expect, it } from 'bun:test'
import { normalizeQueueConnection } from '../src/queue.module.js'

describe('QueueModule connection options', () => {
  it('wraps Redis URLs for BullMQ 6', () => {
    expect(normalizeQueueConnection('redis://redis:6379')).toEqual({
      url: 'redis://redis:6379',
    })
  })

  it('preserves object connection options', () => {
    const connection = { host: 'redis', port: 6379, db: 2 }

    expect(normalizeQueueConnection(connection)).toBe(connection)
  })
})
