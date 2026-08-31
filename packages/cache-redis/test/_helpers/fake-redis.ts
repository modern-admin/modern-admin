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

  async set(key: string, value: string | number | Buffer): Promise<'OK'>
  async set(
    key: string,
    value: string | number | Buffer,
    mode: 'EX',
    ttl: number | string,
  ): Promise<'OK'>
  async set(
    key: string,
    value: string | number | Buffer,
    mode: 'PX',
    ttl: number | string,
    condition: 'NX',
  ): Promise<'OK' | null>
  async set(
    key: string,
    value: string | number | Buffer,
    mode?: 'EX' | 'PX',
    ttl?: number | string,
    condition?: 'NX',
  ): Promise<'OK' | null> {
    const v = typeof value === 'string' ? value : String(value)
    this.record('set', mode ? [key, v, mode, ttl, ...(condition ? [condition] : [])] : [key, v])
    if (condition === 'NX' && this.store.has(key)) return null
    this.store.set(key, v)
    if (mode === 'EX' && ttl !== undefined) this.ttls.set(key, Number(ttl))
    if (mode === 'PX' && ttl !== undefined) this.ttls.set(key, Number(ttl) / 1000)
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

  async sadd(key: string, ...values: (string | number | Buffer)[]): Promise<number> {
    const stringValues = values.map((v) => (typeof v === 'string' ? v : String(v)))
    this.record('sadd', [key, ...stringValues])
    const set = this.sets.get(key) ?? new Set<string>()
    let added = 0
    for (const v of stringValues) {
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

  async srem(key: string, ...values: (string | number | Buffer)[]): Promise<number> {
    const stringValues = values.map(String)
    this.record('srem', [key, ...stringValues])
    const set = this.sets.get(key)
    if (!set) return 0
    let removed = 0
    for (const value of stringValues) if (set.delete(value)) removed++
    if (set.size === 0) this.sets.delete(key)
    return removed
  }

  async expire(key: string, seconds: number | string): Promise<number> {
    this.record('expire', [key, seconds])
    if (this.store.has(key) || this.sets.has(key)) {
      this.ttls.set(key, Number(seconds))
      return 1
    }
    return 0
  }

  async eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown> {
    this.record('eval', [script, numKeys, ...args])
    const keys = args.slice(0, numKeys).map(String)
    const argv = args.slice(numKeys).map(String)

    if (script.includes('MA_CACHE_SET_V2')) {
      const tagCount = Number(argv[0])
      const payload = argv[1]!
      const valueTtlMs = Number(argv[2])
      const tagTtlMs = Number(argv[3])
      const conditional = argv[4] === '1'
      if (conditional) {
        for (let i = 0; i < tagCount; i++) {
          const current = this.store.get(keys[2 + tagCount + i]!) ?? '0'
          if (current !== argv[5 + i]) return 0
        }
      }
      const fullKey = keys[0]!
      const reverseKey = keys[1]!
      for (const oldTag of Array.from(this.sets.get(reverseKey) ?? [])) {
        await this.srem(oldTag, fullKey)
      }
      this.sets.delete(reverseKey)
      this.store.set(fullKey, payload)
      if (valueTtlMs > 0) this.ttls.set(fullKey, valueTtlMs / 1000)
      for (let i = 0; i < tagCount; i++) {
        const tagKey = keys[2 + i]!
        await this.sadd(tagKey, fullKey)
        await this.sadd(reverseKey, tagKey)
        if (tagTtlMs > 0) {
          const current = this.ttls.get(tagKey) ?? 0
          this.ttls.set(tagKey, Math.max(current, tagTtlMs / 1000))
        }
      }
      if (tagCount > 0 && valueTtlMs > 0) this.ttls.set(reverseKey, valueTtlMs / 1000)
      return 1
    }

    if (script.includes('MA_CACHE_INVALIDATE_V2')) {
      const reversePrefix = argv[0]!
      let removed = 0
      for (let i = 0; i < keys.length; i += 2) {
        const epochKey = keys[i + 1]!
        this.store.set(epochKey, String(Number(this.store.get(epochKey) ?? 0) + 1))
      }
      for (let i = 0; i < keys.length; i += 2) {
        const tagKey = keys[i]!
        for (const member of Array.from(this.sets.get(tagKey) ?? [])) {
          const reverseKey = reversePrefix + member
          for (const memberTag of Array.from(this.sets.get(reverseKey) ?? [])) {
            await this.srem(memberTag, member)
          }
          if (this.store.delete(member)) removed++
          this.sets.delete(reverseKey)
          this.ttls.delete(member)
          this.ttls.delete(reverseKey)
        }
        this.sets.delete(tagKey)
        this.ttls.delete(tagKey)
      }
      return removed
    }

    if (script.includes('MA_CACHE_DELETE_V2')) {
      for (let i = 0; i < keys.length; i += 2) {
        const fullKey = keys[i]!
        const reverseKey = keys[i + 1]!
        for (const tagKey of Array.from(this.sets.get(reverseKey) ?? [])) {
          await this.srem(tagKey, fullKey)
        }
        await this.del(fullKey, reverseKey)
      }
      return 1
    }

    if (script.includes('MA_CACHE_RELEASE_LOCK_V1')) {
      if (this.store.get(keys[0]!) === argv[0]) return this.del(keys[0]!)
      return 0
    }
    throw new Error('Unknown Lua script')
  }

  async publish(channel: string, message: string | Buffer): Promise<number> {
    const text = typeof message === 'string' ? message : message.toString()
    this.record('publish', [channel, text])
    const listeners = this.channels.get(channel) ?? []
    for (const fn of listeners) fn(channel, text)
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
      this.channels.set(
        channel,
        listeners.filter((fn) => fn !== handler),
      )
    }
    return this
  }
}
