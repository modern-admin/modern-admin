/**
 * Built-in `ILogStore` implementations.
 *
 * `ConsoleLogStore` and `MemoryLogStore` now live in
 * `@modern-admin/core/system` (so persistent adapters and this plugin
 * share one canonical source of truth). They are re-exported here for
 * backward compatibility with code importing them from
 * `@modern-admin/feature-logging`.
 */

import { ConsoleLogStore, type ILogStore } from '@modern-admin/core'
import type { LogCallback } from './types.js'

export { ConsoleLogStore, MemoryLogStore } from '@modern-admin/core'

/** Resolve `store` option (callback | ILogStore | undefined) to an ILogStore. */
export function resolveStore(store: ILogStore | LogCallback | undefined): ILogStore {
  if (!store) return new ConsoleLogStore()
  if (typeof store === 'function') {
    return { record: (entry) => store(entry) }
  }
  return store
}
