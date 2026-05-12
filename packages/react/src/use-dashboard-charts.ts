import { useCallback, useEffect, useState } from 'react'
import {
  EMPTY_DASHBOARD,
  dashboardBlobZ,
  uuidv7,
  type ChartDef,
  type ChartDefInput,
  type ChartGroup,
  type DashboardBlob,
  type IDashboardStore,
  type TimeRange,
} from '@modern-admin/core'
import type { AdminClient, TimeSeriesMetric, TimeSeriesStep } from './client.js'

const STORAGE_PREFIX = 'modern-admin:dashboard:v1:'
const ANON_USER = '__anon__'

/**
 * localStorage-backed `IDashboardStore`. Persists one blob per user under
 * `modern-admin:dashboard:v1:<userId>` so multiple admins on the same
 * browser do not see each other's charts.
 *
 * SSR-safe: `typeof window` checks gate every access; on the server load()
 * returns `EMPTY_DASHBOARD` and save() is a no-op.
 */
export class LocalStorageDashboardStore implements IDashboardStore {
  load(userId: string): DashboardBlob {
    if (typeof window === 'undefined') return EMPTY_DASHBOARD
    try {
      const raw = window.localStorage.getItem(STORAGE_PREFIX + (userId || ANON_USER))
      if (!raw) return EMPTY_DASHBOARD
      const parsed = JSON.parse(raw) as unknown
      const result = dashboardBlobZ.safeParse(parsed)
      // Legacy bare-array shapes and other malformed blobs reset to empty
      // rather than crashing the dashboard.
      return result.success ? result.data : EMPTY_DASHBOARD
    } catch {
      return EMPTY_DASHBOARD
    }
  }

  save(userId: string, blob: DashboardBlob): void {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(
        STORAGE_PREFIX + (userId || ANON_USER),
        JSON.stringify(blob),
      )
    } catch {
      // Quota exceeded / private mode — silently drop.
    }
  }
}

const defaultStore = new LocalStorageDashboardStore()

/**
 * Server-backed `IDashboardStore` that persists per-user dashboard layouts
 * via `GET/PUT /admin/api/dashboard`. Requires `configStore` to be wired in
 * `ModernAdminModule.forRoot()`. Falls back gracefully when the endpoint
 * returns an empty dashboard (e.g. first load or missing configStore).
 */
export class ServerDashboardStore implements IDashboardStore {
  constructor(private readonly client: AdminClient) {}

  async load(_userId: string): Promise<DashboardBlob> {
    try {
      const res = await this.client.loadDashboard()
      return res.dashboard
    } catch {
      return EMPTY_DASHBOARD
    }
  }

  async save(_userId: string, blob: DashboardBlob): Promise<void> {
    try {
      await this.client.saveDashboard(blob)
    } catch {
      // Server unavailable — silently drop. The next save attempt will retry.
    }
  }
}

// ─── Time-range helpers ──────────────────────────────────────────────────

/**
 * Resolve a `TimeRange` (preset or explicit custom) into concrete
 * inclusive `from`/`to` `YYYY-MM-DD` strings. Presets are anchored to
 * `now` so cards always reflect "the last N days" without re-saving.
 *
 * `'all'` resolves to a 10-year window ending at `now`, which is wide
 * enough for any realistic admin dataset while keeping the server's
 * date-range constraint satisfied.
 */
export function resolveRange(
  range: TimeRange,
  now: Date = new Date(),
): { from: string; to: string } {
  if (range.preset === 'custom') return { from: range.from, to: range.to }
  const days =
    range.preset === '7d' ? 7
    : range.preset === '30d' ? 30
    : range.preset === '90d' ? 90
    : range.preset === '1y' ? 365
    : 3650 // 'all' → 10 years
  const to = new Date(now)
  const from = new Date(now)
  from.setDate(from.getDate() - days)
  return { from: ymd(from), to: ymd(to) }
}

/**
 * Equal-length window immediately preceding `[from, to]`.
 */
export function previousRangeOf(
  range: { from: string; to: string },
): { from: string; to: string } | null {
  const f = new Date(range.from).getTime()
  const t = new Date(range.to).getTime()
  if (isNaN(f) || isNaN(t) || t < f) return null
  const span = t - f
  const prevTo = new Date(f - 86_400_000)
  const prevFrom = new Date(prevTo.getTime() - span)
  return { from: ymd(prevFrom), to: ymd(prevTo) }
}

const ymd = (d: Date): string => d.toISOString().slice(0, 10)

// ─── Reload signal ───────────────────────────────────────────────────────

/**
 * Module-scoped pub/sub so external code (e.g. AI assistant widget after a
 * chart mutation) can force the dashboard to reload its blob from the store
 * without lifting state up. Subscribers are notified asynchronously.
 */
const dashboardReloadListeners = new Set<() => void>()

/** Signal every mounted `useDashboardCharts` hook to reload from its store. */
export function emitDashboardReload(): void {
  for (const listener of dashboardReloadListeners) {
    try {
      listener()
    } catch {
      // Listener errors must not block sibling listeners.
    }
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────

export interface UseDashboardChartsOptions {
  /** Used to scope the storage key. `null`/`undefined` defers loading. */
  userId: string | null | undefined
  /** Override the default localStorage store (e.g. server-backed in future). */
  store?: IDashboardStore
}

export interface UseDashboardChartsResult {
  charts: ChartDef[]
  /** Groups defined on the dashboard, sorted by `order` ascending. */
  groups: ChartGroup[]
  /** True until the initial load has resolved (relevant for async stores). */
  isLoading: boolean
  /** Append a new chart. Auto-assigns to the first group when groups exist and no `groupId` is provided. */
  addChart(input: ChartDefInput): void
  updateChart(id: string, input: ChartDefInput): void
  removeChart(id: string): void
  /**
   * Create a new group. When this is the very first group, every existing
   * (ungrouped) chart is moved into it so the user keeps the same view.
   * Returns the new group id so callers can switch to it.
   */
  addGroup(input: { name: string; order?: number }): string
  updateGroup(id: string, patch: { name?: string; order?: number }): void
  /** Remove a group AND every chart assigned to it. */
  removeGroup(id: string): void
}

/**
 * Per-user dashboard chart registry backed by `IDashboardStore` (default:
 * `LocalStorageDashboardStore`). When `userId` is null/undefined the hook
 * returns an empty list and ignores writes — used while
 * `useCurrentUser()` is still loading.
 */
export function useDashboardCharts(
  options: UseDashboardChartsOptions,
): UseDashboardChartsResult {
  const { userId, store = defaultStore } = options
  const [charts, setCharts] = useState<ChartDef[]>([])
  const [groups, setGroups] = useState<ChartGroup[]>([])
  const [isLoading, setIsLoading] = useState(true)
  // Bumping this counter re-runs the load effect; used by external
  // `emitDashboardReload()` callers (e.g. AI assistant widget) so the hook
  // can pick up changes other actors made to the underlying store.
  const [reloadTick, setReloadTick] = useState(0)

  // Reload whenever `userId` flips (login / logout / switch) or an external
  // reload is signalled.
  useEffect(() => {
    if (!userId) {
      setCharts([])
      setIsLoading(false)
      return
    }
    let cancelled = false
    setIsLoading(true)
    Promise.resolve(store.load(userId)).then((blob) => {
      if (cancelled) return
      setCharts(blob.charts)
      setGroups([...blob.groups].sort(byOrderThenCreated))
      setIsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [userId, store, reloadTick])

  // Subscribe to module-scoped reload signal.
  useEffect(() => {
    const listener = (): void => setReloadTick((tick) => tick + 1)
    dashboardReloadListeners.add(listener)
    return () => {
      dashboardReloadListeners.delete(listener)
    }
  }, [])

  // Single persist that writes BOTH charts and groups so a partial update
  // never strands one in localStorage while overwriting the other.
  const persist = useCallback(
    (nextCharts: ChartDef[], nextGroups: ChartGroup[]): void => {
      setCharts(nextCharts)
      setGroups([...nextGroups].sort(byOrderThenCreated))
      if (!userId) return
      void Promise.resolve(
        store.save(userId, { version: 1, charts: nextCharts, groups: nextGroups }),
      )
    },
    [userId, store],
  )

  const addChart = useCallback(
    (input: ChartDefInput): void => {
      const now = new Date().toISOString()
      // When groups exist and the caller didn't pick one, fall back to the
      // first-ordered group so the new chart is visible somewhere.
      const fallbackGroupId = input.groupId ?? groups[0]?.id
      const def = {
        ...input,
        id: uuidv7(),
        title: input.title ?? '',
        filters: input.filters ?? {},
        ...(fallbackGroupId ? { groupId: fallbackGroupId } : {}),
        createdAt: now,
        updatedAt: now,
      } as ChartDef
      persist([...charts, def], groups)
    },
    [charts, groups, persist],
  )

  const updateChart = useCallback(
    (id: string, input: ChartDefInput): void => {
      persist(
        charts.map((c) =>
          c.id === id
            ? ({
                ...c,
                ...input,
                id,
                title: input.title ?? '',
                filters: input.filters ?? {},
                createdAt: c.createdAt,
                updatedAt: new Date().toISOString(),
              } as ChartDef)
            : c,
        ),
        groups,
      )
    },
    [charts, groups, persist],
  )

  const removeChart = useCallback(
    (id: string): void => {
      persist(charts.filter((c) => c.id !== id), groups)
    },
    [charts, groups, persist],
  )

  const addGroup = useCallback(
    (input: { name: string; order?: number }): string => {
      const now = new Date().toISOString()
      const id = uuidv7()
      const next: ChartGroup = {
        id,
        name: input.name,
        order: input.order ?? groups.length,
        createdAt: now,
        updatedAt: now,
      }
      // First-group rule: existing ungrouped charts join this group so the
      // user does not lose their current dashboard view.
      const isFirstGroup = groups.length === 0
      const nextCharts = isFirstGroup
        ? charts.map((c) => (c.groupId ? c : { ...c, groupId: id, updatedAt: now }))
        : charts
      persist(nextCharts, [...groups, next])
      return id
    },
    [charts, groups, persist],
  )

  const updateGroup = useCallback(
    (id: string, patch: { name?: string; order?: number }): void => {
      const now = new Date().toISOString()
      persist(
        charts,
        groups.map((g) =>
          g.id === id
            ? {
                ...g,
                ...(patch.name !== undefined ? { name: patch.name } : {}),
                ...(patch.order !== undefined ? { order: patch.order } : {}),
                updatedAt: now,
              }
            : g,
        ),
      )
    },
    [charts, groups, persist],
  )

  const removeGroup = useCallback(
    (id: string): void => {
      // Cascading delete: every chart assigned to the group disappears with it.
      persist(charts.filter((c) => c.groupId !== id), groups.filter((g) => g.id !== id))
    },
    [charts, groups, persist],
  )

  return {
    charts,
    groups,
    isLoading,
    addChart,
    updateChart,
    removeChart,
    addGroup,
    updateGroup,
    removeGroup,
  }
}

/** Stable sort: by `order` ascending, then by `createdAt` for tie-breaking. */
function byOrderThenCreated(a: { order: number; createdAt: string }, b: { order: number; createdAt: string }): number {
  if (a.order !== b.order) return a.order - b.order
  return a.createdAt.localeCompare(b.createdAt)
}

// Re-export types from client for convenience so consumers import from one place.
export type { TimeSeriesMetric, TimeSeriesStep }
export type { ChartDef, ChartDefInput, ChartGroup } from '@modern-admin/core'
