export type {
  FieldDiffEntry as HistoryDiffEntry,
  HistoryEntry,
  HistoryOp,
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
  userIdResolver?: (admin: CurrentAdmin | undefined) => string | undefined
}

export interface HistoryPluginOptions extends HistoryFeatureOptions {
  include?: string[]
  exclude?: string[]
}
