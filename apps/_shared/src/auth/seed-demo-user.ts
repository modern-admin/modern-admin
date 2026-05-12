// Seeds a known-credentials demo admin so the login screen has something
// to log in with on a fresh DB. Idempotent — silently swallows "already
// exists" errors so reseeding a persistent DB on every boot is safe.
//
// Both reference apps use this; only the log-prefix label differs.

import type { betterAuth } from 'better-auth'

type AuthInstance = ReturnType<typeof betterAuth>

export interface SeedDemoUserOptions {
  /** Better Auth instance whose `signUpEmail` API we call. */
  auth: AuthInstance
  /** Log prefix (e.g. `modern-admin/api`). */
  label?: string
}

/**
 * Sign up the configured demo admin (DEMO_ADMIN_EMAIL / DEMO_ADMIN_PASSWORD
 * / DEMO_ADMIN_NAME, with the project-wide defaults). On Better Auth flavours
 * configured with the admin plugin and `defaultRole: 'admin'` this also
 * grants the user the admin role.
 */
export async function seedDemoUser({
  auth,
  label = 'modern-admin/app',
}: SeedDemoUserOptions): Promise<void> {
  const email = process.env.DEMO_ADMIN_EMAIL ?? 'admin@example.com'
  const password = process.env.DEMO_ADMIN_PASSWORD ?? 'admin12345'
  const name = process.env.DEMO_ADMIN_NAME ?? 'Demo Admin'
  const api = auth.api as unknown as {
    signUpEmail?: (args: {
      body: { email: string; password: string; name: string }
    }) => Promise<unknown>
  }
  if (typeof api.signUpEmail !== 'function') return
  try {
    await api.signUpEmail({ body: { email, password, name } })
    // eslint-disable-next-line no-console
    console.log(`[${label}] seeded demo admin: ${email} / ${password}`)
  } catch (err) {
    // Better Auth throws when the user already exists — that's expected
    // on re-runs. Anything else gets surfaced for visibility.
    const message = err instanceof Error ? err.message : String(err)
    if (/exists|duplicate|UNIQUE/i.test(message)) {
      // eslint-disable-next-line no-console
      console.log(`[${label}] demo admin already present: ${email}`)
      return
    }
    // eslint-disable-next-line no-console
    console.warn(`[${label}] failed to seed demo admin:`, message)
  }
}
