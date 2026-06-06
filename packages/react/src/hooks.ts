// TanStack Query hooks that wrap AdminClient. Query keys are
// `[resourceId, action, params?]` so cache invalidation is precise.

import * as React from 'react'
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import { useAdminClient } from './provider.js'
import type {
  AdminConfig,
  AdminFeatures,
  CustomActionResponse,
  CurrentUser,
  ListQuery,
  ListResponse,
  RecordResponse,
  ResourceJSON,
} from './types.js'
import { resolveFeatures } from './types.js'
import {
  AdminApiError,
  type AuthUiProps,
  type AuditLogQuery,
  type AuditLogResponse,
  type GlobalSearchResponse,
  type HistoryListResponse,
  type HistoryRevisionResponse,
  type TimeSeriesQuery,
  type TimeSeriesResponse,
} from './client.js'
import { useI18n } from './i18n.js'

const KEY_CONFIG = ['modern-admin', 'config'] as const
const keyList = (resourceId: string, query?: ListQuery) =>
  ['modern-admin', resourceId, 'list', query ?? null] as const
const keyShow = (resourceId: string, recordId: string) =>
  ['modern-admin', resourceId, 'show', recordId] as const
const keyHistory = (resourceId: string, recordId: string) =>
  ['modern-admin', resourceId, 'history', recordId] as const
const keyHistoryRevision = (resourceId: string, recordId: string, revisionId: string) =>
  ['modern-admin', resourceId, 'history', recordId, revisionId] as const
const keyAuditLog = (query?: AuditLogQuery) =>
  ['modern-admin', 'audit-log', query ?? null] as const

export const useAdminConfig = (): UseQueryResult<AdminConfig> => {
  const client = useAdminClient()
  return useQuery({ queryKey: KEY_CONFIG, queryFn: () => client.config(), staleTime: 60_000 })
}

export const useResource = (resourceId: string | undefined): ResourceJSON | undefined => {
  const { data } = useAdminConfig()
  const { localizeResource } = useI18n()
  return React.useMemo(() => {
    const resource = data?.resources.find((r) => r.id === resourceId)
    return resource ? localizeResource(resource) : undefined
  }, [data?.resources, localizeResource, resourceId])
}

/**
 * Capability flags advertised by the backend via `/admin/api/config`.
 * Use to gate optional UI surfaces (audit-log link, settings sections,
 * revisions button, AI assistant widget) — every flag is `false` until
 * the bootstrap config is loaded, so consumers can render unconditionally
 * and the gating logic short-circuits during the initial paint.
 */
export const useFeatures = (): AdminFeatures => {
  const { data } = useAdminConfig()
  return React.useMemo(() => resolveFeatures(data?.features), [data?.features])
}

export const useResources = (): ResourceJSON[] => {
  const { data } = useAdminConfig()
  const { localizeResource } = useI18n()
  return React.useMemo(
    () => (data?.resources ?? []).map((resource) => localizeResource(resource)),
    [data?.resources, localizeResource],
  )
}

/**
 * Fetch distinct values for a field, cached for 5 minutes.
 * Used by the filter value picker to offer multi-select when cardinality is low.
 * The `enabled` flag allows lazy loading only when the filter UI is open.
 */
export const useDistinctValues = (
  resourceId: string,
  field: string,
  options?: { search?: string; limit?: number; enabled?: boolean },
): UseQueryResult<{ values: string[]; hasMore: boolean }> => {
  const client = useAdminClient()
  return useQuery({
    queryKey: ['modern-admin', resourceId, 'values', field, options?.search ?? '', options?.limit ?? 100] as const,
    queryFn: () => client.distinctValues(resourceId, field, {
      search: options?.search,
      limit: options?.limit,
    }),
    staleTime: 5 * 60_000, // 5 min cache
    enabled: options?.enabled !== false,
  })
}

export const useRecords = (
  resourceId: string,
  query?: ListQuery,
): UseQueryResult<ListResponse> => {
  const client = useAdminClient()
  return useQuery({
    queryKey: keyList(resourceId, query),
    queryFn: () => client.list(resourceId, query),
  })
}

export const useRecord = (
  resourceId: string,
  recordId: string | undefined,
): UseQueryResult<RecordResponse> => {
  const client = useAdminClient()
  return useQuery({
    queryKey: keyShow(resourceId, recordId ?? ''),
    queryFn: () => client.show(resourceId, recordId!),
    enabled: !!recordId,
  })
}

export const useCreateRecord = (
  resourceId: string,
): UseMutationResult<RecordResponse, Error, Record<string, unknown>> => {
  const client = useAdminClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload) => client.create(resourceId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['modern-admin', resourceId] })
    },
  })
}

export const useUpdateRecord = (
  resourceId: string,
): UseMutationResult<
  RecordResponse,
  Error,
  { id: string; payload: Record<string, unknown> }
> => {
  const client = useAdminClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }) => client.update(resourceId, id, payload),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['modern-admin', resourceId] })
      qc.invalidateQueries({ queryKey: keyShow(resourceId, id) })
    },
  })
}

export const useDeleteRecord = (
  resourceId: string,
): UseMutationResult<void, Error, string> => {
  const client = useAdminClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => client.delete(resourceId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['modern-admin', resourceId] })
    },
  })
}

export const useBulkDeleteRecords = (
  resourceId: string,
): UseMutationResult<unknown, Error, ReadonlyArray<string>> => {
  const client = useAdminClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids) => client.bulkDelete(resourceId, ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['modern-admin', resourceId] })
    },
  })
}

const keySearch = (resourceId: string, query: string) =>
  ['modern-admin', resourceId, 'search', query] as const

/**
 * Live-search hook against a resource's `search` action. Used by reference
 * comboboxes — debounce the input on the call site.
 */
// ─── Auth ─────────────────────────────────────────────────────────────────

const KEY_ME = ['modern-admin', 'auth', 'me'] as const
const KEY_AUTH_UI = ['modern-admin', 'auth', 'ui-props'] as const

export interface CurrentUserResult {
  user: CurrentUser | null
  isLoading: boolean
  isAuthenticated: boolean
  error: Error | null
}

/** Resolve the current admin via /admin/api/auth/me. A 401 response surfaces
 *  as `user: null` (rather than an error) so callers can branch on it to
 *  render the login screen. */
export const useCurrentUser = (): CurrentUserResult => {
  const client = useAdminClient()
  const query = useQuery<{ user: CurrentUser } | null, Error>({
    queryKey: KEY_ME,
    queryFn: async () => {
      try {
        return await client.me()
      } catch (err) {
        if (err instanceof AdminApiError && err.status === 401) return null
        throw err
      }
    },
    staleTime: 30_000,
    retry: (failureCount, err) => {
      if (err instanceof AdminApiError && err.status === 401) return false
      return failureCount < 1
    },
  })
  return {
    user: query.data?.user ?? null,
    isLoading: query.isLoading,
    isAuthenticated: !!query.data?.user,
    error: query.error,
  }
}

/** Fetch public auth UI metadata (enabled social providers, email/password flag).
 *  Cached indefinitely — the provider list is static for a given deployment. */
export const useAuthUiProps = (): UseQueryResult<AuthUiProps> => {
  const client = useAdminClient()
  return useQuery({
    queryKey: KEY_AUTH_UI,
    queryFn: () => client.getAuthUiProps(),
    staleTime: Infinity,
  })
}

/** Initiate OAuth social login. Navigates the browser away to the provider;
 *  `isPending` is true while the redirect URL is being fetched. */
export const useSocialLogin = (): UseMutationResult<void, Error, string> => {
  const client = useAdminClient()
  return useMutation({
    mutationFn: (provider: string) => client.loginSocial(provider),
  })
}

export const useLogin = (): UseMutationResult<
  void,
  Error,
  { email: string; password: string }
> => {
  const client = useAdminClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ email, password }) => client.login(email, password),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY_ME })
      qc.invalidateQueries({ queryKey: KEY_CONFIG })
    },
  })
}

export const useLogout = (): UseMutationResult<void, Error, void> => {
  const client = useAdminClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => client.logout(),
    onSuccess: async () => {
      // Cancel any in-flight `me` refetch so it cannot overwrite the
      // optimistic null below and bounce the gate back to authenticated.
      await qc.cancelQueries({ queryKey: KEY_ME })
      // Flip the auth gate to "logged out" immediately. We deliberately
      // do NOT invalidate KEY_ME here — Better Auth has already deleted
      // the server-side session, but the Set-Cookie header may not be
      // applied to outgoing requests for a tick, and a refetch in that
      // window would return the still-valid user and cancel the logout
      // visually. The next mount/refresh will re-check freshly.
      qc.setQueryData(KEY_ME, null)
      // Drop every other cached resource so list/show data doesn't
      // linger behind the login form.
      qc.removeQueries({
        predicate: (q) => {
          const k = q.queryKey as readonly unknown[]
          return !(k[0] === 'modern-admin' && k[1] === 'auth' && k[2] === 'me')
        },
      })
    },
  })
}

export const useInvokeRecordAction = (
  resourceId: string,
): UseMutationResult<CustomActionResponse, Error, { recordId: string; actionName: string }> => {
  const client = useAdminClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ recordId, actionName }) =>
      client.invokeRecordAction(resourceId, recordId, actionName),
    onSuccess: (_data, { recordId }) => {
      qc.invalidateQueries({ queryKey: ['modern-admin', resourceId] })
      qc.invalidateQueries({ queryKey: ['modern-admin', resourceId, 'show', recordId] })
    },
  })
}

export const useInvokeBulkAction = (
  resourceId: string,
): UseMutationResult<CustomActionResponse, Error, { actionName: string; ids: string[] }> => {
  const client = useAdminClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ actionName, ids }) => client.invokeBulkAction(resourceId, actionName, ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['modern-admin', resourceId] })
    },
  })
}

export const useInvokeResourceAction = (
  resourceId: string,
): UseMutationResult<CustomActionResponse, Error, { actionName: string; payload?: Record<string, unknown> }> => {
  const client = useAdminClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ actionName, payload }) => client.invokeResourceAction(resourceId, actionName, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['modern-admin', resourceId] })
    },
  })
}

/**
 * Cross-resource search hook. Fires a single batched request that fans out
 * to every registered resource's `search` action; results are grouped by
 * resource. The empty-query case is handled by the caller (skip render);
 * `enabled` allows lazy activation while the dialog is closed.
 */
export const useGlobalSearch = (
  query: string,
  enabled = true,
): UseQueryResult<GlobalSearchResponse> => {
  const client = useAdminClient()
  return useQuery({
    queryKey: ['modern-admin', 'global-search', query] as const,
    // Forward the AbortSignal TanStack Query attaches to each invocation.
    // The signal fires when the query key changes (next keystroke) or the
    // component unmounts, letting the server short-circuit stale work.
    queryFn: ({ signal }) => client.globalSearch(query, undefined, { signal }),
    enabled: enabled && query.trim().length > 0,
    staleTime: 30_000,
  })
}

export const useSearchRecords = (
  resourceId: string | undefined,
  query: string,
  enabled = true,
): UseQueryResult<ListResponse> => {
  const client = useAdminClient()
  return useQuery({
    queryKey: keySearch(resourceId ?? '', query),
    queryFn: () => client.search(resourceId!, query),
    enabled: !!resourceId && enabled,
    staleTime: 30_000,
  })
}

/**
 * Distinct (deduplicated, sorted) values pulled from a single field of a
 * resource — the data source for the autocomplete `suggestionsResource +
 * suggestionsField` binding on `KeyValueFieldSpec`. Loads up to `perPage`
 * records and projects `field` client-side; for typical admin resources
 * (hundreds–low thousands of rows) this is plenty cheap. For very large
 * tables, reach for a dedicated `distinct` endpoint.
 */
export const useFieldSuggestions = (
  resourceId: string | undefined,
  field: string | undefined,
  perPage = 200,
): UseQueryResult<string[]> => {
  const client = useAdminClient()
  return useQuery({
    queryKey: ['modern-admin', 'fieldSuggestions', resourceId ?? '', field ?? '', perPage],
    queryFn: async (): Promise<string[]> => {
      const res = await client.list(resourceId!, { perPage })
      const seen = new Set<string>()
      const out: string[] = []
      for (const r of res.records) {
        const raw = r.params?.[field!]
        if (raw == null || raw === '') continue
        const v = String(raw)
        if (seen.has(v)) continue
        seen.add(v)
        out.push(v)
      }
      out.sort((a, b) => a.localeCompare(b))
      return out
    },
    enabled: !!resourceId && !!field,
    staleTime: 60_000,
  })
}

export const useTimeSeries = (
  query: TimeSeriesQuery | null,
): UseQueryResult<TimeSeriesResponse> => {
  const client = useAdminClient()
  return useQuery({
    queryKey: ['modern-admin', 'timeseries', query],
    queryFn: () => client.timeseries(query!),
    enabled: query !== null && !!query.resource && !!query.dateField,
    staleTime: 60_000,
  })
}

export const useRecordHistory = (
  resourceId: string,
  recordId: string | undefined,
  options: { limit?: number; offset?: number } = {},
): UseQueryResult<HistoryListResponse> => {
  const client = useAdminClient()
  return useQuery({
    queryKey: [...keyHistory(resourceId, recordId ?? ''), options] as const,
    queryFn: () => client.listHistory(resourceId, recordId!, options),
    enabled: !!resourceId && !!recordId,
    staleTime: 30_000,
  })
}

export const useHistoryRevision = (
  resourceId: string,
  recordId: string | undefined,
  revisionId: string | undefined,
): UseQueryResult<HistoryRevisionResponse> => {
  const client = useAdminClient()
  return useQuery({
    queryKey: keyHistoryRevision(resourceId, recordId ?? '', revisionId ?? ''),
    queryFn: () => client.getHistoryRevision(resourceId, recordId!, revisionId!),
    enabled: !!resourceId && !!recordId && !!revisionId,
    staleTime: 30_000,
  })
}

export const useRevertRevision = (
  resourceId: string,
  recordId: string,
): UseMutationResult<RecordResponse, Error, { revisionId: string; reason?: string }> => {
  const client = useAdminClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ revisionId, reason }) =>
      client.revertHistoryRevision(resourceId, recordId, revisionId, { reason }),
    onSuccess: (_data, { revisionId }) => {
      qc.invalidateQueries({ queryKey: ['modern-admin', resourceId] })
      qc.invalidateQueries({ queryKey: keyShow(resourceId, recordId) })
      qc.invalidateQueries({ queryKey: keyHistory(resourceId, recordId) })
      qc.invalidateQueries({ queryKey: keyHistoryRevision(resourceId, recordId, revisionId) })
    },
  })
}

export const useAuditLog = (
  query: AuditLogQuery = {},
): UseQueryResult<AuditLogResponse> => {
  const client = useAdminClient()
  return useQuery({
    queryKey: keyAuditLog(query),
    queryFn: () => client.listAuditLog(query),
    staleTime: 30_000,
  })
}

/**
 * Cursor-based infinite scroll variant of `useAuditLog`.
 * Each page passes the `at` timestamp of the last entry as the `before` cursor.
 * `pageSize` entries are requested; if the response is full, there are more pages.
 */
export const useInfiniteAuditLog = (
  filters: Omit<AuditLogQuery, 'before' | 'offset' | 'limit'>,
  pageSize: number,
): UseInfiniteQueryResult<InfiniteData<AuditLogResponse>, Error> => {
  const client = useAdminClient()
  return useInfiniteQuery({
    queryKey: ['modern-admin', 'audit-log-infinite', filters],
    queryFn: ({ pageParam }) =>
      client.listAuditLog({
        ...filters,
        limit: pageSize + 1,
        before: pageParam as number | undefined,
      }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => {
      const events = lastPage.events
      if (events.length <= pageSize) return undefined
      return events[pageSize - 1]!.at
    },
    staleTime: 30_000,
  })
}
