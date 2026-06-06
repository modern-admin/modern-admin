import type { IRealtimeBus, RealtimeEvent, RealtimeHandler } from '@modern-admin/core'

/**
 * Minimal duck-typed surface of an ioredis client. We never import the real
 * type so consumers can swap implementations (mock, sentinel, cluster) as
 * long as `publish`, `subscribe`, and `duplicate` are present.
 */
export interface RealtimeRedisLike {
  publish(channel: string, message: string): Promise<unknown>
  subscribe(channel: string): Promise<unknown> | unknown
  unsubscribe(channel: string): Promise<unknown> | unknown
  on(event: 'message', listener: (channel: string, message: string) => void): unknown
  off(event: 'message', listener: (channel: string, message: string) => void): unknown
  duplicate(): RealtimeRedisLike
  /** Optional teardown for tests/process exits. */
  quit?(): Promise<unknown> | unknown
}

export interface RedisRealtimeBusOptions {
  client: RealtimeRedisLike
  channel?: string
}

const DEFAULT_CHANNEL = 'modern-admin:realtime'

/**
 * Realtime bus backed by Redis pub/sub for cross-instance fan-out. Uses a
 * dedicated subscriber connection (`client.duplicate()`) so subscriptions do
 * not block the publisher's command pipeline. Events are JSON-encoded; an
 * unparseable payload is dropped silently to avoid bringing the listener
 * down on a single bad publish.
 */
export class RedisRealtimeBus implements IRealtimeBus {
  private readonly publisher: RealtimeRedisLike
  private readonly channel: string
  private subscriber: RealtimeRedisLike | null = null
  private subscriberStarted: Promise<void> | null = null
  private readonly handlers = new Set<RealtimeHandler>()

  constructor(options: RedisRealtimeBusOptions) {
    this.publisher = options.client
    this.channel = options.channel ?? DEFAULT_CHANNEL
  }

  async publish(event: RealtimeEvent): Promise<void> {
    await this.publisher.publish(this.channel, JSON.stringify(event))
  }

  async subscribe(handler: RealtimeHandler): Promise<() => void> {
    this.handlers.add(handler)
    await this.ensureSubscriber()
    return () => {
      this.handlers.delete(handler)
    }
  }

  /** Stop the subscriber connection. Useful in tests / graceful shutdown. */
  async close(): Promise<void> {
    if (this.subscriber) {
      const sub = this.subscriber
      this.subscriber = null
      this.subscriberStarted = null
      try {
        await sub.unsubscribe(this.channel)
      } catch {
        // ignore
      }
      if (typeof sub.quit === 'function') {
        try {
          await sub.quit()
        } catch {
          // ignore
        }
      }
    }
    this.handlers.clear()
  }

  private async ensureSubscriber(): Promise<void> {
    if (this.subscriberStarted) return this.subscriberStarted
    const sub = this.publisher.duplicate()
    this.subscriber = sub
    this.subscriberStarted = (async () => {
      sub.on('message', (channel, message) => {
        if (channel !== this.channel) return
        let event: RealtimeEvent
        try {
          event = JSON.parse(message) as RealtimeEvent
        } catch {
          return
        }
        for (const handler of this.handlers) {
          void handler(event)
        }
      })
      await sub.subscribe(this.channel)
    })()
    return this.subscriberStarted
  }
}
