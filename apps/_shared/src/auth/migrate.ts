// Runs Better Auth's built-in schema migrations against the configured
// database. Used by `apps/api` (bun:sqlite); `apps/api-prisma` runs
// migrations through Prisma instead and does not call this.

import { getMigrations } from 'better-auth/db/migration'
import type { BetterAuthOptions } from 'better-auth'

/** Create Better Auth's expected tables on the configured store.
 * Idempotent — safe to call on every boot. */
export async function migrateAuth(config: BetterAuthOptions): Promise<void> {
  const { runMigrations } = await getMigrations(config)
  await runMigrations()
}
