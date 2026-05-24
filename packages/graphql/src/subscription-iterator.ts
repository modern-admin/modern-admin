// Bridges the `IRealtimeBus` push API into a pull-based AsyncIterator so
// graphql-js' `subscribe()` can drive a GraphQL subscription. One iterator is
// created per active client subscription; on `return()`/`throw()` it
// unsubscribes from the bus so closed connections don't leak handlers.

import type { IRealtimeBus, RealtimeEvent } from '@modern-admin/core'

export interface SubscriptionFilter {
  resourceId: string
  kind?: RealtimeEvent['kind'] | null
}

export const createRealtimeAsyncIterator = (
  bus: IRealtimeBus,
  filter: SubscriptionFilter,
): AsyncIterableIterator<RealtimeEvent> => {
  const queue: RealtimeEvent[] = []
  const pending: Array<(result: IteratorResult<RealtimeEvent>) => void> = []
  let closed = false
  let unsubscribe: (() => void) | null = null

  const subscribed = bus.subscribe((event) => {
    if (closed) return
    if (event.resourceId !== filter.resourceId) return
    if (filter.kind && event.kind !== filter.kind) return
    const waiter = pending.shift()
    if (waiter) {
      waiter({ value: event, done: false })
    } else {
      queue.push(event)
    }
  })

  // The subscribe call is async (Redis bus issues network IO). Capture the
  // unsubscribe fn as soon as it resolves so a fast close() still tears down
  // the listener once the registration completes.
  subscribed.then(
    (fn) => {
      if (closed) {
        fn()
      } else {
        unsubscribe = fn
      }
    },
    (err) => {
      const waiter = pending.shift()
      if (waiter) waiter({ value: undefined, done: true })
      closed = true
      // Surface async subscribe failures via the next throw path.
      // eslint-disable-next-line no-console
      console.error('[modern-admin/graphql] subscription bus.subscribe failed', err)
    },
  )

  const teardown = (): IteratorResult<RealtimeEvent> => {
    if (!closed) {
      closed = true
      if (unsubscribe) unsubscribe()
      while (pending.length > 0) {
        const waiter = pending.shift()!
        waiter({ value: undefined, done: true })
      }
    }
    return { value: undefined, done: true }
  }

  const iterator: AsyncIterableIterator<RealtimeEvent> = {
    next(): Promise<IteratorResult<RealtimeEvent>> {
      if (queue.length > 0) {
        return Promise.resolve({ value: queue.shift()!, done: false })
      }
      if (closed) {
        return Promise.resolve({ value: undefined, done: true })
      }
      return new Promise((resolve) => pending.push(resolve))
    },
    return(): Promise<IteratorResult<RealtimeEvent>> {
      return Promise.resolve(teardown())
    },
    throw(err): Promise<IteratorResult<RealtimeEvent>> {
      teardown()
      return Promise.reject(err)
    },
    [Symbol.asyncIterator]() {
      return this
    },
  }

  return iterator
}
