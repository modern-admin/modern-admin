// Realtime helper for the React client. Stays transport-agnostic — host apps
// wire up socket.io / SSE / WebSocket and pass an `onEvent` subscriber here.
// `createSocketRealtimeSubscriber` (realtime-socket.ts) provides the default
// socket.io transport matching `@modern-admin/realtime`'s gateway; the shell
// wires it automatically when the backend advertises `features.realtime`.

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { invalidateResourceData } from './hooks.js'

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
 * matching TanStack Query caches. Every mutation event fans out through
 * `invalidateResourceData`, which drops the mutated resource's queries,
 * linked resources' queries (populated references, related-record tables),
 * and cross-resource aggregates (global search, time series, audit log).
 *
 * Pass `null`/`undefined` to render the hook inert (e.g. while the
 * backend hasn't advertised `features.realtime` yet).
 */
export function useRealtimeInvalidation(
  subscriber: RealtimeSubscriber | null | undefined,
): void {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!subscriber) return
    return subscriber((event) => {
      invalidateResourceData(queryClient, event.resourceId)
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
  queryClient.setQueriesData<unknown>(
    { queryKey: ['modern-admin', resourceId, 'list'] },
    (data: unknown) => {
      const list = data as { records?: Array<{ id: string }>; meta?: { total: number } } | undefined
      if (!list || !Array.isArray(list.records)) return data
      const next = list.records.filter((r) => r.id !== recordId)
      if (next.length === list.records.length) return data
      return {
        ...list,
        records: next,
        meta: list.meta ? { ...list.meta, total: Math.max(0, list.meta.total - 1) } : list.meta,
      }
    },
  )
}
