import { MemoryHistoryStore, type HistoryRetention, type IHistoryStore } from '@modern-admin/core'

export { MemoryHistoryStore } from '@modern-admin/core'

let warnedMemoryFallback = false

/** `bun test` and most runners set `NODE_ENV=test`; stay quiet there. */
const isTestEnv = (): boolean =>
  typeof process !== 'undefined' && process.env?.NODE_ENV === 'test'

/**
 * Resolve the store to use. When the host hasn't wired a persistent
 * backend we fall back to an in-memory store — fine for tests and demos,
 * but it grows for the life of the process, so we warn once outside tests.
 * The `retention` policy bounds that default store's growth.
 */
export function resolveStore(
  store: IHistoryStore | undefined,
  retention: HistoryRetention = {},
): IHistoryStore {
  if (store) return store
  if (!warnedMemoryFallback && !isTestEnv()) {
    warnedMemoryFallback = true
    console.warn(
      '[history] no persistent store configured — falling back to ' +
        'MemoryHistoryStore. Revisions are lost on restart and accumulate ' +
        'in memory; wire a database-backed IHistoryStore for production.',
    )
  }
  return new MemoryHistoryStore(retention)
}
