/**
 * Resource lifecycle event published whenever a record is created, updated,
 * or deleted. Transports broadcast these to connected clients (WebSockets,
 * server-sent events) so frontends can refresh caches in near-realtime.
 */
export interface RealtimeEvent {
  kind: 'created' | 'updated' | 'deleted'
  resourceId: string
  recordId?: string
  /** Optional snapshot of the record params after the mutation. */
  record?: Record<string, unknown>
  /** Identifier of the admin user that triggered the change, if known. */
  actorId?: string
  /** Server timestamp in ms since epoch. */
  at: number
}

export type RealtimeHandler = (event: RealtimeEvent) => void | Promise<void>

/**
 * Realtime bus port. Implementations may be in-memory (single-instance) or
 * pub/sub backed (Redis) for cross-instance fan-out.
 */
export interface IRealtimeBus {
  publish(event: RealtimeEvent): Promise<void>
  /** Returns an unsubscribe function. */
  subscribe(handler: RealtimeHandler): Promise<() => void>
}

/**
 * No-op bus used when no realtime transport is configured. Subscribers never
 * receive events; publishes are silently dropped.
 */
export class NoopRealtimeBus implements IRealtimeBus {
  async publish(): Promise<void> {
    // no-op
  }
  async subscribe(): Promise<() => void> {
    return () => {
      // no-op
    }
  }
}

/**
 * In-memory fan-out bus. Useful for development, single-process deployments,
 * and tests. Calls each subscriber synchronously in the order they were
 * registered; awaits async handlers so publish() resolves once all listeners
 * have processed the event.
 */
export class InMemoryRealtimeBus implements IRealtimeBus {
  private readonly handlers = new Set<RealtimeHandler>()

  async publish(event: RealtimeEvent): Promise<void> {
    for (const handler of this.handlers) {
      await handler(event)
    }
  }

  async subscribe(handler: RealtimeHandler): Promise<() => void> {
    this.handlers.add(handler)
    return () => {
      this.handlers.delete(handler)
    }
  }
}
