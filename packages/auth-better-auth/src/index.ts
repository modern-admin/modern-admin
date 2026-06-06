// @modern-admin/auth-better-auth — IAuthProvider implementation backed by
// Better Auth. We treat the Better Auth instance as opaque (`auth.api.*`) so
// upgrades within Better Auth don't ripple through this adapter's surface.

import type { CurrentAdmin, IAuthProvider, LoginCredentials } from '@modern-admin/core'

/** Wire shape of an apikey row returned by better-auth's api-key plugin. */
export interface ApiKeyRow {
  id: string
  name: string | null
  start: string | null
  prefix: string | null
  enabled: boolean
  permissions?: Record<string, string[]> | null
  expiresAt: Date | string | null
  lastRequest: Date | string | null
  createdAt: Date | string
  updatedAt: Date | string
}

/** Plaintext key returned only by `createApiKey`. */
export interface ApiKeyCreated extends ApiKeyRow {
  key: string
}

/**
 * Subset of better-auth's api-key plugin endpoints we expose to transports
 * for the admin Settings UI. Methods mirror the wire calls 1:1.
 */
export interface ApiKeyAdminApi {
  createApiKey(args: {
    body: {
      name?: string
      expiresIn?: number | null
      permissions?: Record<string, string[]>
      userId?: string
    }
    headers?: Headers
  }): Promise<ApiKeyCreated>

  listApiKeys(args: { headers: Headers }): Promise<ApiKeyRow[]>

  updateApiKey(args: {
    body: {
      keyId: string
      name?: string
      enabled?: boolean
      permissions?: Record<string, string[]> | null
      expiresIn?: number | null
      userId?: string
    }
    headers?: Headers
  }): Promise<ApiKeyRow>

  deleteApiKey(args: { body: { keyId: string }; headers: Headers }): Promise<{ success: boolean }>
}

interface BetterAuthApi extends Partial<ApiKeyAdminApi> {
  getSession(args: { headers: Headers }): Promise<{
    user?: { id: string; email?: string; name?: string; image?: string | null; [key: string]: unknown }
    session?: { id: string; expiresAt?: Date | string }
  } | null>

  signInEmail?(args: { body: { email: string; password: string } }): Promise<unknown>

  signOut?(args: { headers: Headers }): Promise<unknown>

  /** Optional, present when the @better-auth/api-key plugin is mounted. */
  verifyApiKey?(args: {
    body: { key: string; permissions?: Record<string, string[]> }
  }): Promise<{
    valid: boolean
    error: { code: string; message?: string } | null
    key: {
      id: string
      name: string | null
      referenceId: string
      enabled: boolean
      expiresAt: Date | string | null
      permissions?: Record<string, string[]> | null
      [k: string]: unknown
    } | null
  }>
}

/**
 * Structural shape we accept for the configured Better Auth instance.
 *
 * `api` is intentionally typed as `Record<string, unknown>` rather than the
 * strict `BetterAuthApi` interface above: at the type level, real Better Auth
 * exposes every `api.*` method as `Promise<Response>` (it's an HTTP endpoint
 * surface), but at runtime direct calls return the structured data objects
 * `BetterAuthApi` describes. Matching those two views structurally would force
 * consumers to write `auth as never` at every `new BetterAuthProvider({ auth })`
 * call site. Instead we widen the public type and cast once internally via
 * the `api` getter below.
 */
export interface BetterAuthInstance {
  api: Record<string, unknown>
  /** UI hint surface — list of enabled providers/passkeys/etc. */
  options?: { socialProviders?: Record<string, unknown>; emailAndPassword?: { enabled?: boolean } }
}

interface RequestLike {
  headers: Headers | Record<string, string | string[] | undefined>
}

const toHeaders = (input: RequestLike['headers']): Headers => {
  if (input instanceof Headers) return input
  const headers = new Headers()
  for (const [key, value] of Object.entries(input)) {
    if (value == null) continue
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v))
    else headers.set(key, value)
  }
  return headers
}

const resolveSessionUserId = async (
  api: BetterAuthApi,
  headers: Headers | undefined,
): Promise<string> => {
  if (!headers) throw new Error('Not authenticated')
  const session = await api.getSession({ headers })
  if (!session?.user?.id) throw new Error('Not authenticated')
  return session.user.id
}

export interface BetterAuthProviderOptions {
  /** A configured `betterAuth({...})` instance. */
  auth: BetterAuthInstance
}

export class BetterAuthProvider implements IAuthProvider {
  constructor(private readonly options: BetterAuthProviderOptions) {
  }

  /** Internal accessor — narrows the widened `api` field back to BetterAuthApi. */
  private get api(): BetterAuthApi {
    return this.options.auth.api as unknown as BetterAuthApi
  }

  getUiProps(): Record<string, unknown> {
    const opts = this.options.auth.options ?? {}
    return {
      providers: Object.keys(opts.socialProviders ?? {}),
      emailAndPassword: Boolean(opts.emailAndPassword?.enabled),
    }
  }

  async login(credentials: LoginCredentials): Promise<CurrentAdmin | null> {
    const api = this.api
    if (!api.signInEmail || !credentials.email || !credentials.password) return null
    try {
      await api.signInEmail({
        body: { email: credentials.email, password: credentials.password },
      })
    } catch {
      return null
    }
    // Session cookie is now installed; the next request will resolve it.
    return null
  }

  async getCurrentUser(requestContext: unknown): Promise<CurrentAdmin | null> {
    const req = requestContext as RequestLike | undefined
    if (!req) return null
    const headers = toHeaders(req.headers)
    const session = await this.api.getSession({ headers })
    if (!session?.user) return null

    const principal: CurrentAdmin = {
      id: session.user.id,
      ...(session.user.email != null ? { email: session.user.email } : {}),
      ...(session.user.name != null ? { name: session.user.name } : {}),
      ...(session.user.image != null ? { avatarUrl: session.user.image } : {}),
      // `role` is added to the session user by better-auth's admin plugin.
      // Cast through index signature — harmless when the plugin is absent.
      ...(typeof session.user.role === 'string' ? { role: session.user.role } : {}),
    }

    // If the request authenticated via `x-api-key`, look up the key row to
    // attach permissions + key id onto the principal. The core invoke() gate
    // uses `apiKey.permissions` to allow/deny resource×action combinations.
    const apiKeyHeader = headers.get('x-api-key')
    const verify = this.api.verifyApiKey
    if (apiKeyHeader && verify) {
      try {
        const result = await verify({ body: { key: apiKeyHeader } })
        if (result.valid && result.key) {
          principal.apiKey = {
            id: result.key.id,
            ...(result.key.name != null ? { name: result.key.name } : {}),
            permissions: result.key.permissions ?? {},
          }
        }
      } catch {
        // Verification errors fall through — getSession already accepted the
        // key, so identity is valid; permissions just won't be attached and
        // the action gate will deny anything except wildcards.
      }
    }
    return principal
  }

  async logout(requestContext: unknown): Promise<void> {
    const req = requestContext as RequestLike | undefined
    if (!req || !this.api.signOut) return
    await this.api.signOut({ headers: toHeaders(req.headers) })
  }

  /**
   * Create a root admin on first boot using Better Auth's `signUpEmail` endpoint.
   * Idempotent — silently skips when the user already exists. The admin plugin's
   * `defaultRole` configuration is responsible for assigning the admin role on
   * sign-up. When `role` is explicitly provided and Better Auth's admin plugin
   * is mounted with `adminSetRole`, the role is updated after creation.
   */
  async seedAdmin(opts: {
    email: string
    password: string
    name?: string
    role?: string
  }): Promise<void> {
    const api = this.api as BetterAuthApi & {
      signUpEmail?: (args: {
        body: { email: string; password: string; name: string }
      }) => Promise<{ user?: { id?: string } } | null>
      adminSetRole?: (args: {
        body: { userId: string; role: string }
      }) => Promise<unknown>
    }

    if (typeof api.signUpEmail !== 'function') return

    const name = opts.name ?? opts.email.split('@')[0] ?? 'Admin'
    let userId: string | undefined

    try {
      const result = await api.signUpEmail({ body: { email: opts.email, password: opts.password, name } })
      userId = result?.user?.id

      console.log(`[modern-admin] seeded root admin: ${opts.email}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (/exists|duplicate|UNIQUE/i.test(message)) {

        console.log(`[modern-admin] root admin already present: ${opts.email}`)
        return
      }

      console.warn(`[modern-admin] root admin seed failed:`, message)
      return
    }

    // Optionally set an explicit role when the admin plugin supports it
    // and a role other than the defaultRole was requested.
    if (userId && opts.role && typeof api.adminSetRole === 'function') {
      try {
        await api.adminSetRole({ body: { userId, role: opts.role } })
      } catch {
        // Role assignment is best-effort — sign-up succeeded; log and continue.

        console.warn(`[modern-admin] could not set role '${opts.role}' for ${opts.email}`)
      }
    }
  }

  /**
   * Returns the api-key admin surface (create/list/update/delete) when the
   * better-auth instance has the api-key plugin mounted; `null` otherwise.
   * Transports use this to expose Settings → API Keys CRUD without binding
   * to better-auth internals directly.
   */
  getApiKeyAdmin(): ApiKeyAdminApi | null {
    const api = this.api
    const { createApiKey, listApiKeys, updateApiKey, deleteApiKey } = api
    if (
      typeof createApiKey !== 'function' ||
      typeof listApiKeys !== 'function' ||
      typeof updateApiKey !== 'function' ||
      typeof deleteApiKey !== 'function'
    ) {
      return null
    }
    return {
      createApiKey: async ({ body, headers }) => {
        const userId = await resolveSessionUserId(api, headers)
        return createApiKey({
          body: {
            ...body,
            userId,
          },
        })
      },
      listApiKeys: listApiKeys.bind(api),
      updateApiKey: async ({ body, headers }) => {
        const hasServerOnlyFields =
          body.enabled !== undefined ||
          body.permissions !== undefined ||
          body.expiresIn !== undefined
        if (!hasServerOnlyFields) {
          if (!headers) throw new Error('Not authenticated')
          return updateApiKey({ body, headers })
        }
        const userId = await resolveSessionUserId(api, headers)
        return updateApiKey({
          body: {
            ...body,
            userId,
          },
        })
      },
      deleteApiKey: deleteApiKey.bind(api),
    }
  }
}
