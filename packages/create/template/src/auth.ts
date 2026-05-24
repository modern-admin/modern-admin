/**
 * Better Auth setup for {{name}}.
 *
 * **Allowlist-only by default.** Public sign-up is disabled and OAuth
 * logins are only accepted for emails that already exist in `ma_user`.
 * Admins are provisioned from inside the admin panel (Settings → Admins),
 * not via the login screen. See https://www.better-auth.com/docs for
 * adding passkeys, 2FA, or relaxing the allowlist.
 *
 * Login events are written to the action log by the
 * `session.create.after` hook below — `admin.module.ts` registers the
 * log store via `setAuditLogStore()`.
 */
import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { apiKey } from '@better-auth/api-key'
import { admin } from 'better-auth/plugins'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { uuidv7, type ILogStore } from '@modern-admin/core'
import { prisma } from './db.js'

const port = Number(process.env.PORT ?? 3001)
const baseURL = process.env.BETTER_AUTH_URL ?? `http://localhost:${port}`

// Audit-log sink for the `session.create.after` hook. The NestJS DI
// container that owns the real store is bootstrapped AFTER this module
// (Better Auth has to be ready before admin.module.ts loads), so the
// hook reads this slot lazily on each login event.
let _auditLogStore: ILogStore | null = null

/** Register the action-log store used to record login events. */
export const setAuditLogStore = (store: ILogStore | null): void => {
  _auditLogStore = store
}

export const auth = betterAuth({
  baseURL,
  basePath: '/admin/api/auth',
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  // Map Better Auth's logical tables onto our Prisma model names. The
  // `@@map("ma_user")` directives in schema.prisma take care of the
  // physical table names. Better Auth's prismaAdapter resolves these
  // strings against the Prisma client's delegate keys, not the
  // underlying tables — so PascalCase (Prisma model names) is correct.
  user: { modelName: 'MaUser' },
  session: { modelName: 'MaSession' },
  verification: { modelName: 'MaVerification' },
  emailAndPassword: {
    enabled: true,
    // Public registration disabled. New admins are added from inside
    // the panel (Settings → Admins).
    disableSignUp: true,
  },
  // When an OAuth callback delivers an email that matches an existing
  // `ma_user`, link the new account to that user instead of attempting
  // to create a fresh one. Combined with the `user.create.before` hook
  // below, this makes `ma_user` itself the allowlist.
  account: {
    modelName: 'MaAccount',
    accountLinking: {
      enabled: true,
      // Defaults to every active OAuth provider. Narrow this list if
      // you do NOT trust a provider's verified-email signal.
      trustedProviders: ['github', 'google', 'apple'],
    },
  },
  trustedOrigins: process.env.WEB_ORIGIN?.split(',') ?? [],
  plugins: [
    apiKey({
      apiKeyHeaders: 'x-api-key',
      requireName: true,
      enableSessionForAPIKeys: true,
      rateLimit: { enabled: false },
      schema: { apikey: { modelName: 'MaApiKey' } },
    }),
    // Admin plugin — required for role-based gating. It both declares
    // the `role` column on MaUser and (crucially) attaches `role` to
    // the session, which is where `currentAdmin.role` is read from.
    // Without this plugin every `isAccessible: ({currentAdmin}) =>
    // currentAdmin?.role === 'admin'` check returns false, and the
    // `rolesResourceId` permission gate cannot resolve a role — even
    // when `ma_user.role` is populated in the database.
    admin({ defaultRole: process.env.DEMO_ADMIN_ROLE ?? 'admin' }),
  ],
  databaseHooks: {
    user: {
      create: {
        before: async () => {
          // Reachable only via an OAuth callback whose email is NOT in
          // `ma_user` (email/password sign-up is disabled outright). Reject
          // → the login fails and no user row is created. To onboard a new
          // admin, add their row from Settings → Admins first.
          throw new APIError('FORBIDDEN', {
            message:
              'Sign-up is disabled. Ask an administrator to add your account before signing in.',
          })
        },
      },
    },
    session: {
      create: {
        after: async (session) => {
          const store = _auditLogStore
          if (!store) return
          try {
            await store.record({
              id: uuidv7(),
              resourceId: '__auth__',
              action: 'login',
              userId: session.userId,
              at: Date.now(),
            })
          } catch {
            // Audit logging is best-effort — never block a login on a
            // logging failure.
          }
        },
      },
    },
  },
})
