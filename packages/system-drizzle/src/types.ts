/**
 * Structural Drizzle typings used by the system stores.
 *
 * Drizzle's typed `db` carries a heavy dialect-specific generic load
 * (`PgDatabase`, `MySqlDatabase`, `BetterSQLite3Database`, …). To stay
 * dialect-agnostic at the package boundary we accept a `DrizzleLike`
 * surface — runtime calls go through a small handful of methods every
 * builder exposes. Hosts pass their concrete `drizzle(...)` instance and
 * it satisfies this shape structurally.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { SystemTables } from './schema/pg.js'

/**
 * Loose Drizzle client surface. The real `drizzle(...)` instance has a
 * much richer typed API; we only depend on the methods we actually call.
 */
export type DrizzleLike = {
  insert: (table: any) => any
  select: (fields?: any) => any
  update: (table: any) => any
  delete: (table: any) => any
}

export type { SystemTables }
