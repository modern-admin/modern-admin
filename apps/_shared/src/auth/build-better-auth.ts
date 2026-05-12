// Shared Better Auth factory used by every reference app.
//
// Both the bun:sqlite (`apps/api`) and Prisma+Postgres (`apps/api-prisma`)
// flavours configure Better Auth identically apart from the `database`
// slot and a couple of optional plugins (admin role plugin, passkey).
// `buildBetterAuth()` consolidates the common bits — api-key plugin,
// social providers, baseURL/trustedOrigins/email-and-password — and
// publishes the resulting instance on globalThis so the admin module
// loaders can pick it up at module-load time.

import { betterAuth, type BetterAuthOptions, type BetterAuthPlugin } from 'better-auth'
import { apiKey } from '@better-auth/api-key'

export interface BuildBetterAuthOptions {
  /** Database slot to pass through to `betterAuth()`. */
  database: BetterAuthOptions['database']
  /** Plugins appended after the default api-key plugin (admin, passkey…). */
  extraPlugins?: BetterAuthPlugin[]
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
}

export interface BuiltBetterAuth {
  /** The fully configured Better Auth instance. */
  auth: ReturnType<typeof betterAuth>
  /** Final config object — useful for `runMigrations()` consumers. */
  config: BetterAuthOptions
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
    ...extraPlugins,
  ]

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
    emailAndPassword: { enabled: true, autoSignIn: true },
    user: { modelName: resolvedModelNames.user },
    session: { modelName: resolvedModelNames.session },
    account: { modelName: resolvedModelNames.account },
    verification: { modelName: resolvedModelNames.verification },
    ...(Object.keys(socialProviders).length ? { socialProviders } : {}),
    plugins,
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
