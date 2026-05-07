// Better Auth instance for the reference app. We use bun:sqlite (zero native
// build) so the API boots without external services. Email + password is
// always on; GitHub OAuth activates only when GITHUB_CLIENT_ID/SECRET are
// set; passkeys mount when the optional plugin is available.

import { betterAuth, type BetterAuthOptions, type BetterAuthPlugin } from 'better-auth'
import { getMigrations } from 'better-auth/db/migration'
import { Database } from 'bun:sqlite'

const SQLITE_PATH = process.env.AUTH_DB_PATH ?? ':memory:'

const socialProviders: BetterAuthOptions['socialProviders'] = {}
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  socialProviders.github = {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
  }
}

const plugins: BetterAuthPlugin[] = []
try {
  // Passkeys live in an optional subpath. Load lazily so a missing dependency
  // never breaks API boot. The unknown→callable cast keeps typecheck quiet
  // when the subpath isn't resolvable in the local install.
  const mod = (await import('better-auth/plugins/passkey' as string)) as {
    passkey?: () => BetterAuthPlugin
  }
  if (typeof mod.passkey === 'function') plugins.push(mod.passkey())
} catch {
  // passkey plugin unavailable — silently skip.
}

// bun:sqlite's Database has the same surface Better Auth expects from a
// node:sqlite / better-sqlite3 instance for its built-in adapter. Cast
// through `unknown` to keep the public type of `auth` from referencing
// internal sqlite types.
const sqlite = new Database(SQLITE_PATH) as unknown as BetterAuthOptions['database']

const authConfig: BetterAuthOptions = {
  database: sqlite,
  baseURL: process.env.AUTH_BASE_URL ?? `http://localhost:${process.env.API_PORT ?? 3001}`,
  trustedOrigins: process.env.WEB_ORIGIN?.split(',') ?? ['http://localhost:5173'],
  emailAndPassword: { enabled: true, autoSignIn: true },
  ...(Object.keys(socialProviders).length ? { socialProviders } : {}),
  ...(plugins.length ? { plugins } : {}),
}

export const auth = betterAuth(authConfig)

/** Create Better Auth's expected tables on the configured SQLite store.
 * Runs against an empty :memory: DB on every boot, or once against a
 * persistent file at AUTH_DB_PATH. Idempotent. */
export async function migrateAuth(): Promise<void> {
  const { runMigrations } = await getMigrations(authConfig)
  await runMigrations()
}
