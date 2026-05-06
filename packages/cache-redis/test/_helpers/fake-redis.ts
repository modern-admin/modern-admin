// In-memory stand-in for ioredis covering the surface RedisCacheProvider uses.
// Tests assert against the recorded command log to keep coverage transport-level
// rather than tied to any particular client implementation.

export interface RecordedCall {
  method: string
  args: unknown[]
}

export class FakeRedis {
  store = new Map<string, string>()
  sets = new Map<string, Set<string>>()
  ttls = new Map<string, number>()
  calls: RecordedCall[] = []
  channels = new Map<string, Array<(channel: string, message: string) => void>>()

  private record(method: string, args: unknown[]): void {
    this.calls.push({ method, args })
  }

  async get(key: string): Promise<string | null> {
    this.record('get', [key])
    return this.store.get(key) ?? null
  }

  async set(key: string, value: string, mode?: 'EX', ttl?: number): Promise<'OK'> {
    this.record('set', mode ? [key, value, mode, ttl] : [key, value])
    this.store.set(key, value)
    if (mode === 'EX' && typeof ttl === 'number') this.ttls.set(key, ttl)
    return 'OK'
  }

  async del(...keys: string[]): Promise<number> {
    this.record('del', keys)
    let removed = 0
    for (const key of keys) {
      if (this.store.delete(key)) removed += 1
      if (this.sets.delete(key)) removed += 1
      this.ttls.delete(key)
    }
    return removed
  }

  async sadd(key: string, ...values: string[]): Promise<number> {
    this.record('sadd', [key, ...values])
    const set = this.sets.get(key) ?? new Set<string>()
    let added = 0
    for (const v of values) {
      if (!set.has(v)) {
        set.add(v)
        added += 1
      }
    }
    this.sets.set(key, set)
    return added
  }

  async smembers(key: string): Promise<string[]> {
    this.record('smembers', [key])
    return Array.from(this.sets.get(key) ?? [])
  }

  async publish(channel: string, message: string): Promise<number> {
    this.record('publish', [channel, message])
    const listeners = this.channels.get(channel) ?? []
    for (const fn of listeners) fn(channel, message)
    return listeners.length
  }

  duplicate(): FakeRedis {
    const copy = new FakeRedis()
    copy.channels = this.channels
    return copy
  }

  async subscribe(channel: string): Promise<number> {
    this.record('subscribe', [channel])
    if (!this.channels.has(channel)) this.channels.set(channel, [])
    return this.channels.get(channel)!.length
  }

  async unsubscribe(channel: string): Promise<number> {
    this.record('unsubscribe', [channel])
    this.channels.delete(channel)
    return 0
  }

  on(event: 'message', handler: (channel: string, message: string) => void): this {
    this.record('on', [event])
    if (event !== 'message') return this
    // Attach this handler to every currently-subscribed channel.
    for (const [channel, listeners] of this.channels) {
      listeners.push(handler)
      this.channels.set(channel, listeners)
    }
    // Also intercept future subscribe() calls so the listener is wired up.
    const originalSubscribe = this.subscribe.bind(this)
    this.subscribe = async (channel: string) => {
      const result = await originalSubscribe(channel)
      const listeners = this.channels.get(channel) ?? []
      if (!listeners.includes(handler)) listeners.push(handler)
      this.channels.set(channel, listeners)
      return result
    }
    return this
  }

  off(event: string, handler: (channel: string, message: string) => void): this {
    this.record('off', [event])
    for (const [channel, listeners] of this.channels) {
      this.channels.set(channel, listeners.filter((fn) => fn !== handler))
    }
    return this
  }
}
