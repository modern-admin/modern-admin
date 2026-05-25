// Shared Better Auth factory used by the reference host
// (`apps/api-prisma`, Prisma + Postgres) and any external host that
// wires `@modern-admin/app-shared`. The host passes its own `database`
// slot (e.g. `prismaAdapter(prisma, { provider: 'postgresql' })`) plus
// any extra plugins it needs (admin role plugin, passkey). The factory
// consolidates the common bits — api-key plugin, social providers,
// baseURL/trustedOrigins/email-and-password — and publishes the
// resulting instance on globalThis so the admin module loaders can pick
// it up at module-load time.

import { betterAuth, type BetterAuthOptions, type BetterAuthPlugin } from 'better-auth'
import { APIError } from 'better-auth/api'
import { apiKey } from '@better-auth/api-key'
import { uuidv7, type ILogStore } from '@modern-admin/core'

export interface BuildBetterAuthOptions {
  /** Database slot to pass through to `betterAuth()`. */
  database: BetterAuthOptions['database']
  /** Plugins appended after the default api-key plugin (admin, passkey…). */
  extraPlugins?: unknown[]
  modelNames?: {
    user?: string
    session?: string
    account?: string
    verification?: string
    apikey?: string
  }
  /**
   * Default port used to assemble the fallback `baseURL` when neither
   * `AUTH_BASE_URL` nor `API_PORT` are set.
   */
  defaultPort?: number
  /**
   * Restrict logins to email addresses already present in `ma_user`.
   *
   * Mechanics:
   *  - `emailAndPassword.disableSignUp: true` — disables the public
   *    email/password registration endpoint.
   *  - `account.accountLinking.enabled: true` + trustedProviders — when
   *    an OAuth callback delivers an email that already exists in
   *    `ma_user`, the OAuth account is linked to that user instead of
   *    creating a new one.
   *  - `databaseHooks.user.create.before` — rejects any remaining attempt
   *    to create a new user (i.e. an OAuth login whose email is NOT
   *    in `ma_user`), making the `ma_user` table itself the allowlist.
   *
   * Admins are added inside the panel (by other admins) — there is no
   * public self-signup. Defaults to `false` so reference demo apps and
   * `seedDemoUser()` keep working.
   */
  allowlistOnly?: boolean
  /**
   * Providers trusted for automatic account linking when `allowlistOnly`
   * is on. Defaults to every active social provider id (i.e. anything
   * configured via `GITHUB_*` / `GOOGLE_*` env vars). Only set this if
   * you have a provider whose verified-email signal you do NOT trust.
   */
  oauthTrustedProviders?: string[]
}

export interface BuiltBetterAuth {
  /** The fully configured Better Auth instance. */
  auth: ReturnType<typeof betterAuth>
  /** Final config object — useful for `runMigrations()` consumers. */
  config: BetterAuthOptions
}

// ─── Audit-log sink ───────────────────────────────────────────────────────────
//
// `databaseHooks.session.create.after` fires on EVERY successful login
// (email/password, OAuth, passkey, api-key-synthesized session) and is the
// single point where authentication is observed. It writes one
// `ActionLogEntry` per session into the host-provided `logStore`.
//
// The store cannot be passed in at `buildBetterAuth()` time because the
// NestJS DI container that owns it is bootstrapped AFTER Better Auth
// (which has to live on globalThis before admin.module.ts loads). The
// host application calls `setAuditLogStore(system.logStore)` once during
// admin-module construction; the hook reads this slot lazily on each
// event so timing works out.

let _auditLogStore: ILogStore | null = null

/**
 * Register the audit-log sink used by the `session.create.after` hook.
 * Pass `null` to disable. Safe to call multiple times — the latest
 * registration wins.
 */
export const setAuditLogStore = (store: ILogStore | null): void => {
  _auditLogStore = store
}

/**
 * Build a Better Auth instance with the project-wide defaults.
 *
 * The api-key plugin is always mounted (it powers `x-api-key` auth used
 * by the Settings → API Keys page). GitHub OAuth activates only when
 * `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are both present.
 *
 * The instance is published on `globalThis.__betterAuth` so admin
 * module loaders can read it at module-load time, before `main.ts`
 * top-level statements run under ESM ordering.
 */
export const buildBetterAuth = ({
  database,
  extraPlugins = [],
  modelNames,
  defaultPort = 3001,
  allowlistOnly = false,
  oauthTrustedProviders,
}: BuildBetterAuthOptions): BuiltBetterAuth => {
  const resolvedModelNames = {
    user: modelNames?.user ?? 'ma_user',
    session: modelNames?.session ?? 'ma_session',
    account: modelNames?.account ?? 'ma_account',
    verification: modelNames?.verification ?? 'ma_verification',
    apikey: modelNames?.apikey ?? 'ma_apikey',
  }

  const socialProviders: BetterAuthOptions['socialProviders'] = {}
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    socialProviders.github = {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    }
  }
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    socialProviders.google = {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }
  }
  // API keys plugin — adds `apikey` table, `x-api-key` header recognition,
  // and the management endpoints used by the Settings → API Keys UI.
  // Permissions are stored per-key as `Record<resourceId, action[]>`; the
  // actual gate runs in `ModernAdmin.invoke()` via the principal's
  // `apiKey.permissions` claim.
  //
  // `schema.apikey.modelName` maps the plugin's logical "apikey" table to
  // the physical `ma_apikey` so all framework-owned tables share the
  // `ma_` prefix (Better Auth core tables are remapped via the top-level
  // `user/session/account/verification` config below).
  const plugins: BetterAuthPlugin[] = [
    apiKey({
      apiKeyHeaders: 'x-api-key',
      // Names are required so list rows are identifiable in the UI.
      requireName: true,
      // When the request carries `x-api-key`, better-auth synthesises a
      // session for the key's owner. `BetterAuthProvider.getCurrentUser`
      // then looks up the matching apikey row to attach `permissions` and
      // the key id onto the principal so `ModernAdmin.invoke()` can gate
      // actions.
      enableSessionForAPIKeys: true,
      rateLimit: { enabled: false },
      schema: { apikey: { modelName: resolvedModelNames.apikey } },
    }) as BetterAuthPlugin,
    ...(extraPlugins as BetterAuthPlugin[]),
  ]

  // ─── databaseHooks ──────────────────────────────────────────────────────
  // We always install `session.create.after` for audit logging; when
  // `allowlistOnly` is on, `user.create.before` rejects unknown emails.
  const databaseHooks: NonNullable<BetterAuthOptions['databaseHooks']> = {
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
  }

  if (allowlistOnly) {
    databaseHooks.user = {
      create: {
        before: async () => {
          // With `disableSignUp: true` and `accountLinking.enabled: true`,
          // this hook only fires when an OAuth callback delivers an email
          // that does NOT match any existing `ma_user`. Rejecting here
          // turns the `ma_user` table into the allowlist.
          throw new APIError('FORBIDDEN', {
            message:
              'Sign-up is disabled. Ask an administrator to add your account before signing in.',
          })
        },
      },
    }
  }

  // Default the trusted-provider set to every active OAuth provider so
  // existing-user logins via Google/GitHub/Apple link automatically.
  const trustedProviders = oauthTrustedProviders ?? Object.keys(socialProviders)

  const config: BetterAuthOptions = {
    database,
    baseURL: process.env.AUTH_BASE_URL ?? `http://localhost:${process.env.API_PORT ?? defaultPort}`,
    // Origins allowed to use Better Auth endpoints. Default covers the
    // two ports the reference web app is typically served on (Vite
    // preview / dev proxy on 3000, raw `vite` on 5173). Override with
    // WEB_ORIGIN as a comma-separated list in production.
    trustedOrigins: process.env.WEB_ORIGIN?.split(',') ?? [
      'http://localhost:3000',
      'http://localhost:5173',
    ],
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      ...(allowlistOnly ? { disableSignUp: true } : {}),
    },
    user: { modelName: resolvedModelNames.user },
    session: { modelName: resolvedModelNames.session },
    account: {
      modelName: resolvedModelNames.account,
      ...(allowlistOnly
        ? {
            accountLinking: {
              enabled: true,
              trustedProviders,
            },
          }
        : {}),
    },
    verification: { modelName: resolvedModelNames.verification },
    ...(Object.keys(socialProviders).length ? { socialProviders } : {}),
    plugins,
    databaseHooks,
  }

  const auth = betterAuth(config)

  // Publish the instance on globalThis as a side-effect of constructing
  // it. `admin.module.ts` reads it on module load to wire up
  // `BetterAuthProvider` and the api-key service; doing this here (rather
  // than in `main.ts`) guarantees the global is set before any importer
  // (e.g. `AppModule`) executes its own top-level code under ESM ordering.
  ;(globalThis as { __betterAuth?: unknown }).__betterAuth = auth

  return { auth, config }
}
