import type { CurrentAdmin } from './current-admin.js'

export interface LoginCredentials {
  email?: string
  password?: string
  /** Free-form fields for OAuth, magic links, passkeys, etc. */
  [key: string]: unknown
}

/**
 * Transport-agnostic authentication port. NestJS guards / GraphQL context
 * read the current admin via `getCurrentUser` and pass through requests
 * from any framework as opaque `requestContext`.
 */
export interface IAuthProvider {
  /** UI hints (e.g. enabled OAuth providers) returned by the public config. */
  getUiProps(): Record<string, unknown>

  /** Authenticate with given credentials; return null on failure. */
  login(credentials: LoginCredentials): Promise<CurrentAdmin | null>

  /** Resolve the current admin from a transport-specific request context. */
  getCurrentUser(requestContext: unknown): Promise<CurrentAdmin | null>

  /** Invalidate the current session. */
  logout(requestContext: unknown): Promise<void>

  /**
   * Optional: create a root admin user on first boot.
   * Called by `ModernAdminBootstrapService` when `rootAdmin` is configured.
   * Implementations must be idempotent — silently skip when the user already exists.
   */
  seedAdmin?(opts: { email: string; password: string; name?: string; role?: string }): Promise<void>
}

/**
 * Default implementation that allows everything as anonymous. Useful in tests
 * and to keep the framework runnable without an auth plugin in dev.
 */
export class AnonymousAuthProvider implements IAuthProvider {
  getUiProps(): Record<string, unknown> {
    return { anonymous: true }
  }

  async login(): Promise<CurrentAdmin | null> {
    return { id: 'anonymous', role: 'admin' }
  }

  async getCurrentUser(): Promise<CurrentAdmin | null> {
    return { id: 'anonymous', role: 'admin' }
  }

  async logout(): Promise<void> {
    // no-op
  }
}
