// TanStack Query hooks that wrap AdminClient. Query keys are
// `[resourceId, action, params?]` so cache invalidation is precise.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import { useAdminClient } from './provider.js'
import type {
  AdminConfig,
  ListQuery,
  ListResponse,
  RecordResponse,
  ResourceJSON,
} from './types.js'

const KEY_CONFIG = ['modern-admin', 'config'] as const
const keyList = (resourceId: string, query?: ListQuery) =>
  ['modern-admin', resourceId, 'list', query ?? null] as const
const keyShow = (resourceId: string, recordId: string) =>
  ['modern-admin', resourceId, 'show', recordId] as const

export const useAdminConfig = (): UseQueryResult<AdminConfig> => {
  const client = useAdminClient()
  return useQuery({ queryKey: KEY_CONFIG, queryFn: () => client.config(), staleTime: 60_000 })
}

export const useResource = (resourceId: string | undefined): ResourceJSON | undefined => {
  const { data } = useAdminConfig()
  return data?.resources.find((r) => r.id === resourceId)
}

export const useResources = (): ResourceJSON[] => {
  const { data } = useAdminConfig()
  return data?.resources ?? []
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
