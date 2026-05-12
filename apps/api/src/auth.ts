// Better Auth instance for the bun:sqlite reference app.
//
// The flavour-specific bits live here:
//   • bun:sqlite database handle (zero native build).
//   • `admin` plugin for the role column (defaultRole drives demo signup).
//   • Optional passkey plugin loaded lazily — missing dependency is silently skipped.
//
// Everything else (api-key plugin, social providers, baseURL/trustedOrigins,
// email-and-password, globalThis publishing) comes from `@modern-admin/app-shared`.

import type { BetterAuthPlugin } from 'better-auth'
import { admin } from 'better-auth/plugins'
import { Database } from 'bun:sqlite'
import {
  buildBetterAuth,
  migrateAuth as runAuthMigrations,
  seedDemoUser as runSeedDemoUser,
} from '@modern-admin/app-shared'

const SQLITE_PATH = process.env.AUTH_DB_PATH ?? ':memory:'

const extraPlugins: BetterAuthPlugin[] = [
  // Adds `role` column to the `user` table. `defaultRole` is set to 'admin'
  // so the seeded demo user automatically gets the admin role on signup.
  // In production, set defaultRole to 'user' and assign roles explicitly.
  admin({
    defaultRole: process.env.DEMO_ADMIN_ROLE ?? 'admin',
  }) as unknown as BetterAuthPlugin,
]
try {
  // Passkeys live in an optional subpath. Load lazily so a missing dependency
  // never breaks API boot. The unknown→callable cast keeps typecheck quiet
  // when the subpath isn't resolvable in the local install.
  const mod = (await import('better-auth/plugins/passkey' as string)) as {
    passkey?: () => BetterAuthPlugin
  }
  if (typeof mod.passkey === 'function') extraPlugins.push(mod.passkey())
} catch {
  // passkey plugin unavailable — silently skip.
}

// bun:sqlite's Database has the same surface Better Auth expects from a
// node:sqlite / better-sqlite3 instance for its built-in adapter. Cast
// through `unknown` to keep the public type of `auth` from referencing
// internal sqlite types.
const sqlite = new Database(SQLITE_PATH) as unknown as Parameters<
  typeof buildBetterAuth
>[0]['database']

const built = buildBetterAuth({ database: sqlite, extraPlugins })

export const auth = built.auth

/** Create Better Auth's expected tables on the configured SQLite store.
 * Runs against an empty :memory: DB on every boot, or once against a
 * persistent file at AUTH_DB_PATH. Idempotent. */
export const migrateAuth = (): Promise<void> => runAuthMigrations(built.config)

/** Seed the reference demo admin so the login screen has known credentials. */
export const seedDemoUser = (): Promise<void> =>
  runSeedDemoUser({ auth: built.auth, label: 'modern-admin/api' })
