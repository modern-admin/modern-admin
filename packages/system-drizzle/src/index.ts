// @modern-admin/system-drizzle — Drizzle-backed implementations of the
// runtime system stores defined in `@modern-admin/core/system`.
//
// Quick start (Postgres):
//
//   import { drizzle } from 'drizzle-orm/node-postgres'
//   import * as systemSchema from '@modern-admin/system-drizzle/pg'
//   import { setupDrizzleSystem } from '@modern-admin/system-drizzle'
//
//   const db = drizzle(client, { schema: { ...mySchema, ...systemSchema } })
//   const system = setupDrizzleSystem(db, systemSchema)
//
//   new ModernAdmin({
//     databases: [...],
//     plugins: [actionLoggingPlugin({ store: system.logStore })],
//   })
//
// To use a different prefix or schema, copy `src/schema/pg.ts` into your
// project, edit table names, and pass the customised table objects in
// `setupDrizzleSystem(db, customTables)`.

import type { ISystemStores } from '@modern-admin/core'
import { DrizzleLogStore } from './stores/log-store.js'
import { DrizzleWebhookStore } from './stores/webhook-store.js'
import { DrizzleConfigStore } from './stores/config-store.js'
import { DrizzleHistoryStore } from './stores/history-store.js'
import { DrizzleAiTaskStore } from './stores/ai-task-store.js'
import { DrizzleCacheStore } from './stores/cache-store.js'
import type { DrizzleLike, SystemTables } from './types.js'

export interface DrizzleSystem extends ISystemStores {
  logStore: DrizzleLogStore
  webhookStore: DrizzleWebhookStore
  configStore: DrizzleConfigStore
  historyStore: DrizzleHistoryStore
  aiTaskStore: DrizzleAiTaskStore
  cacheStore: DrizzleCacheStore
}

/**
 * Build the full bundle of system stores from a Drizzle client + table
 * objects. The host owns the `db` lifecycle; this just wires tables into
 * thin store classes.
 */
export function setupDrizzleSystem(
  db: DrizzleLike,
  tables: SystemTables,
): DrizzleSystem {
  return {
    logStore: new DrizzleLogStore(db, tables.maLog),
    webhookStore: new DrizzleWebhookStore(db, tables.maWebhook, tables.maWebhookDelivery),
    configStore: new DrizzleConfigStore(db, tables.maConfig),
    historyStore: new DrizzleHistoryStore(db, tables.maHistory),
    aiTaskStore: new DrizzleAiTaskStore(db, tables.maAiTask, tables.maAiTaskEvent),
    cacheStore: new DrizzleCacheStore(db, tables.maCache),
  }
}

export { DrizzleLogStore } from './stores/log-store.js'
export { DrizzleWebhookStore } from './stores/webhook-store.js'
export { DrizzleConfigStore } from './stores/config-store.js'
export { DrizzleHistoryStore } from './stores/history-store.js'
export { DrizzleAiTaskStore } from './stores/ai-task-store.js'
export { DrizzleCacheStore } from './stores/cache-store.js'
export type { DrizzleLike, SystemTables } from './types.js'
