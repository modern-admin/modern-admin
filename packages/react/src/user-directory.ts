import { useQueries } from '@tanstack/react-query'
import { useAdminClient } from './provider.js'
import type { RecordJSON } from './types.js'

/** Convention: the host app exposes panel administrators under the
 *  `admins` resource id (backed by Better Auth's `ma_user` table). When
 *  absent or the lookup fails we fall back to the raw id string. */
export const USERS_RESOURCE_ID = 'admins'

/** Resolve admin user records by id via the conventional `users` resource.
 *  Failed lookups (404 / no users resource) cache as `null` so we don't keep
 *  retrying them on every re-render.
 *
 *  NOTE: uses the `'user-dir'` segment (not `'show'`) so the cached value
 *  (`RecordJSON | null`) doesn't collide with `useRecord`'s cache which stores
 *  the full `RecordResponse` shape under `['modern-admin', id, 'show', ...]`. */
export function useUserDirectory(
  userIds: ReadonlyArray<string>,
): Map<string, RecordJSON | null> {
  const client = useAdminClient()
  const queries = useQueries({
    queries: userIds.map((id) => ({
      queryKey: ['modern-admin', 'user-dir', USERS_RESOURCE_ID, id] as const,
      queryFn: async (): Promise<RecordJSON | null> => {
        try {
          const res = await client.show(USERS_RESOURCE_ID, id)
          return res.record
        } catch {
          return null
        }
      },
      staleTime: 60_000,
      retry: false,
    })),
  })
  const map = new Map<string, RecordJSON | null>()
  userIds.forEach((id, i) => map.set(id, queries[i]?.data ?? null))
  return map
}

/** Pick a human-readable label for an admin record. Checks explicit name
 *  fields first — `record.title` may be the id fallback when the resource
 *  has no matching TITLE_COLUMN_NAMES property. */
export function userLabelOf(
  record: RecordJSON | null | undefined,
  fallback: string,
): string {
  if (!record) return fallback
  const params = record.params ?? {}
  const candidates = [params.name, params.fullName, params.email, record.title]
  for (const candidate of candidates) {
    const s = typeof candidate === 'string' ? candidate.trim() : ''
    if (s && s !== record.id) return s
  }
  return fallback
}
