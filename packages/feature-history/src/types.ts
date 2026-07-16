export type {
  FieldDiffEntry as HistoryDiffEntry,
  HistoryEntry,
  HistoryOp,
  HistoryRetention,
  IHistoryStore,
} from '@modern-admin/core'

import type { CurrentAdmin, HistoryEntry, IHistoryStore } from '@modern-admin/core'

export type HistoryCallback = (entry: HistoryEntry) => void | Promise<void>

export const DEFAULT_HISTORY_ACTIONS = ['new', 'edit', 'delete'] as const

export type HistoryActionName = typeof DEFAULT_HISTORY_ACTIONS[number]

export interface HistoryFeatureOptions {
  store?: IHistoryStore
  actions?: HistoryActionName[]
  excludeFields?: string[]
  /**
   * Keep at most this many of the most recent revisions per record.
   * Applied to the default in-memory store and, when the wired store
   * implements `prune`, enforced after every append.
   */
  keepLast?: number
  /** Drop revisions older than this many days. See {@link keepLast}. */
  keepDays?: number
  /**
   * Include secret fields in snapshots. By default properties typed
   * `password` and statically inaccessible properties (`isAccessible: false`)
   * are stripped so credentials never land in the revision log. Set to
   * `true` only if you have a deliberate reason to persist them.
   */
  includeSecrets?: boolean
  userIdResolver?: (admin: CurrentAdmin | undefined) => string | undefined
}

export interface HistoryPluginOptions extends HistoryFeatureOptions {
  include?: string[]
  exclude?: string[]
}
