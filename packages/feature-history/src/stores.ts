import { MemoryHistoryStore, type IHistoryStore } from '@modern-admin/core'

export { MemoryHistoryStore } from '@modern-admin/core'

export function resolveStore(store: IHistoryStore | undefined): IHistoryStore {
  return store ?? new MemoryHistoryStore()
}
