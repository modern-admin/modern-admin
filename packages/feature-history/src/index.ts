// @modern-admin/feature-history — record revisions for modern-admin.

export { computeFieldDiff, omitFields, valuesEqual } from './diff.js'
export { historyFeature } from './history-feature.js'
export { historyPlugin } from './history-plugin.js'
export { MemoryHistoryStore } from './stores.js'
export type {
  HistoryActionName,
  HistoryDiffEntry,
  HistoryEntry,
  HistoryFeatureOptions,
  HistoryOp,
  HistoryPluginOptions,
  IHistoryStore,
} from './types.js'
