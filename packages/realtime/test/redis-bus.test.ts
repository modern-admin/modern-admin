import { beforeEach, describe, expect, it } from 'bun:test'
import type { RealtimeEvent } from '@modern-admin/core'
import { RedisRealtimeBus, type RealtimeRedisLike } from '../src/redis-bus.js'

interface FakeRedisCall {
  method: string
  args: unknown[]
}

class FakeRedis implements RealtimeRedisLike {
  calls: FakeRedisCall[] = []
  listeners: Array<(channel: string, message: string) => void> = []
  subscribed: string[] = []
  publishes: Array<{ channel: string; message: string }> = []
  duplicates: FakeRedis[] = []

  async publish(channel: string, message: string): Promise<unknown> {
    this.calls.push({ method: 'publish', args: [channel, message] })
    this.publishes.push({ channel, message })
    // Echo to duplicates that have subscribed to this channel.
    for (const dup of this.duplicates) {
      if (dup.subscribed.includes(channel)) {
        for (const l of dup.listeners) l(channel, message)
      }
    }
    return 1
  }

  async subscribe(channel: string): Promise<unknown> {
    this.calls.push({ method: 'subscribe', args: [channel] })
    this.subscribed.push(channel)
    return 1
  }

  async unsubscribe(channel: string): Promise<unknown> {
    this.calls.push({ method: 'unsubscribe', args: [channel] })
    this.subscribed = this.subscribed.filter((c) => c !== channel)
    return 1
  }

  on(event: 'message', listener: (channel: string, message: string) => void): unknown {
    this.calls.push({ method: 'on', args: [event] })
    this.listeners.push(listener)
    return this
  }

  off(event: 'message', listener: (channel: string, message: string) => void): unknown {
    this.calls.push({ method: 'off', args: [event] })
    this.listeners = this.listeners.filter((l) => l !== listener)
    return this
  }

  duplicate(): RealtimeRedisLike {
    const dup = new FakeRedis()
    this.duplicates.push(dup)
    // Cross-link so the duplicate's publishes also reach this client's listeners
    // (mimicking ioredis's shared connection-pool semantics in tests).
    dup.duplicates.push(this)
    return dup
  }

  async quit(): Promise<unknown> {
    this.calls.push({ method: 'quit', args: [] })
    return 'OK'
  }
}

const sampleEvent: RealtimeEvent = {
  kind: 'created',
  resourceId: 'users',
  recordId: '1',
  at: 1700000000000,
}

describe('RedisRealtimeBus', () => {
  let client: FakeRedis
  let bus: RedisRealtimeBus

  beforeEach(() => {
    client = new FakeRedis()
    bus = new RedisRealtimeBus({ client })
  })

  it('publishes JSON-encoded events to the configured channel', async () => {
    await bus.publish(sampleEvent)
    expect(client.publishes).toHaveLength(1)
    const { channel, message } = client.publishes[0]!
    expect(channel).toBe('modern-admin:realtime')
    expect(JSON.parse(message)).toEqual(sampleEvent)
  })

  it('honors a custom channel name', async () => {
    const customBus = new RedisRealtimeBus({ client, channel: 'custom:events' })
    await customBus.publish(sampleEvent)
    expect(client.publishes[0]!.channel).toBe('custom:events')
  })

  it('forwards messages from the duplicate subscriber connection to handlers', async () => {
    const received: RealtimeEvent[] = []
    await bus.subscribe((e) => {
      received.push(e)
    })
    await bus.publish(sampleEvent)
    expect(received).toHaveLength(1)
    expect(received[0]!.recordId).toBe('1')
  })

  it('shares the same subscriber across multiple subscribers', async () => {
    await bus.subscribe(() => {})
    await bus.subscribe(() => {})
    // Only one duplicate should have been created.
    expect(client.duplicates).toHaveLength(1)
  })

  it('unsubscribes from the bus when the returned function is invoked', async () => {
    const received: RealtimeEvent[] = []
    const off = await bus.subscribe((e) => {
      received.push(e)
    })
    off()
    await bus.publish(sampleEvent)
    expect(received).toHaveLength(0)
  })

  it('drops malformed messages without throwing', async () => {
    const received: RealtimeEvent[] = []
    await bus.subscribe((e) => {
      received.push(e)
    })
    const dup = client.duplicates[0]!
    for (const l of dup.listeners) l('modern-admin:realtime', 'not-json{')
    expect(received).toHaveLength(0)
  })

  it('close() unsubscribes and quits the subscriber', async () => {
    await bus.subscribe(() => {})
    const dup = client.duplicates[0]!
    await bus.close()
    expect(dup.calls.find((c) => c.method === 'unsubscribe')).toBeDefined()
    expect(dup.calls.find((c) => c.method === 'quit')).toBeDefined()
  })
})
