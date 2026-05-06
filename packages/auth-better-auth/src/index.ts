// @modern-admin/auth-better-auth — IAuthProvider implementation backed by
// Better Auth. We treat the Better Auth instance as opaque (`auth.api.*`) so
// upgrades within Better Auth don't ripple through this adapter's surface.

import type {
  CurrentAdmin,
  IAuthProvider,
  LoginCredentials,
} from '@modern-admin/core'

interface BetterAuthApi {
  getSession(args: { headers: Headers }): Promise<{
    user?: { id: string; email?: string; name?: string; image?: string | null; [key: string]: unknown }
    session?: { id: string; expiresAt?: Date | string }
  } | null>
  signInEmail?(args: { body: { email: string; password: string } }): Promise<unknown>
  signOut?(args: { headers: Headers }): Promise<unknown>
}

interface BetterAuthInstance {
  api: BetterAuthApi
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

export interface BetterAuthProviderOptions {
  /** A configured `betterAuth({...})` instance. */
  auth: BetterAuthInstance
}

export class BetterAuthProvider implements IAuthProvider {
  constructor(private readonly options: BetterAuthProviderOptions) {}

  getUiProps(): Record<string, unknown> {
    const opts = this.options.auth.options ?? {}
    return {
      providers: Object.keys(opts.socialProviders ?? {}),
      emailAndPassword: Boolean(opts.emailAndPassword?.enabled),
    }
  }

  async login(credentials: LoginCredentials): Promise<CurrentAdmin | null> {
    const api = this.options.auth.api
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
    const session = await this.options.auth.api.getSession({ headers: toHeaders(req.headers) })
    if (!session?.user) return null
    return {
      id: session.user.id,
      ...(session.user.email != null ? { email: session.user.email } : {}),
      ...(session.user.name != null ? { name: session.user.name } : {}),
      ...(session.user.image != null ? { avatarUrl: session.user.image } : {}),
    }
  }

  async logout(requestContext: unknown): Promise<void> {
    const req = requestContext as RequestLike | undefined
    if (!req || !this.options.auth.api.signOut) return
    await this.options.auth.api.signOut({ headers: toHeaders(req.headers) })
  }
}
