// Resolves the Better Auth instance that `build-better-auth.ts` published on
// globalThis and wraps it in:
//
//   • `BetterAuthProvider` — the `IAuthProvider` adapter ModernAdmin consumes,
//   • `IApiKeyService` — the surface `ApiKeysController` uses to back the
//     Settings → API Keys page.
//
// Set `BETTER_AUTH_ENABLED=false` to bypass auth entirely (e.g. local dev
// against a session-DB-less environment).

import { BetterAuthProvider, type BetterAuthProviderOptions } from '@modern-admin/auth-better-auth'
import type { IApiKeyService } from '@modern-admin/nest'

/**
 * Read the Better Auth instance off `globalThis.__betterAuth` and adapt it
 * to ModernAdmin's `IAuthProvider`. Returns `undefined` when auth is
 * disabled (env flag) or the global has not been published yet.
 */
export const buildBetterAuthProvider = (): BetterAuthProvider | undefined => {
  if (process.env.BETTER_AUTH_ENABLED === 'false') return undefined
  const auth = (globalThis as { __betterAuth?: unknown }).__betterAuth
  if (!auth) return undefined
  return new BetterAuthProvider({ auth: auth as BetterAuthProviderOptions['auth'] })
}

/**
 * When the configured BetterAuthProvider has the api-key plugin mounted,
 * adapt its create/list/update/delete surface into `IApiKeyService` so the
 * `ApiKeysController` can serve `/admin/api/api-keys/*` for the Settings
 * page. Without this, those endpoints respond with 501.
 */
export const buildApiKeyService = (
  provider: BetterAuthProvider | undefined,
): IApiKeyService | undefined => {
  const adminApi = provider?.getApiKeyAdmin?.()
  if (!adminApi) return undefined
  return {
    list: (headers) => adminApi.listApiKeys({ headers }),
    create: (body, headers) =>
      adminApi.createApiKey({
        body: {
          name: body.name,
          ...(body.expiresIn !== undefined ? { expiresIn: body.expiresIn } : {}),
          permissions: body.permissions,
        },
        headers,
      }),
    update: (body, headers) => adminApi.updateApiKey({ body, headers }),
    delete: (keyId, headers) => adminApi.deleteApiKey({ body: { keyId }, headers }),
  }
}
