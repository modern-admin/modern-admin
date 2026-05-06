// Realtime helper for the React client. Stays transport-agnostic — host apps
// wire up socket.io / SSE / WebSocket and pass an `onEvent` subscriber here.

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

export interface RealtimeWireEvent {
  kind: 'created' | 'updated' | 'deleted'
  resourceId: string
  recordId?: string
  record?: Record<string, unknown>
  actorId?: string
  at: number
}

export type RealtimeSubscriber = (
  handler: (event: RealtimeWireEvent) => void,
) => () => void

/**
 * Subscribe to wire events from the host transport and invalidate the
 * matching TanStack Query keys. Mutations on a resource invalidate every
 * `[resourceId, ...]` query, which covers list/show/count.
 */
export function useRealtimeInvalidation(subscriber: RealtimeSubscriber): void {
  const queryClient = useQueryClient()
  useEffect(() => {
    return subscriber((event) => {
      const queryKey = [event.resourceId] as const
      void queryClient.invalidateQueries({ queryKey })
    })
  }, [queryClient, subscriber])
}

/**
 * Optimistic local update — apply a deletion immediately to a list query so
 * the row disappears before the round-trip refetch finishes.
 */
export function applyDeletionLocally(
  queryClient: ReturnType<typeof useQueryClient>,
  resourceId: string,
  recordId: string,
): void {
  queryClient.setQueriesData<unknown>({ queryKey: [resourceId, 'list'] }, (data: unknown) => {
    const list = data as { records?: Array<{ id: string }>; meta?: { total: number } } | undefined
    if (!list || !Array.isArray(list.records)) return data
    const next = list.records.filter((r) => r.id !== recordId)
    if (next.length === list.records.length) return data
    return {
      ...list,
      records: next,
      meta: list.meta ? { ...list.meta, total: Math.max(0, list.meta.total - 1) } : list.meta,
    }
  })
}
