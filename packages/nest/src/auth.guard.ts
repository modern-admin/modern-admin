import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common'
import { type ModernAdmin } from '@modern-admin/core'
import { MODERN_ADMIN, MODERN_ADMIN_OPTIONS } from './tokens.js'
import type { ModernAdminModuleOptions } from './module.js'

interface AdminRequest {
  currentAdmin?: unknown
  [key: string]: unknown
}

/**
 * Resolves the current admin via the configured IAuthProvider and stores it
 * on the request as `req.currentAdmin`. Returns 401 when the provider yields
 * no user — except for the auth provider's own login endpoint, which is
 * mounted separately and not behind this guard.
 */
@Injectable()
export class ModernAdminAuthGuard implements CanActivate {
  constructor(@Inject(MODERN_ADMIN) private readonly admin: ModernAdmin) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AdminRequest>()
    const currentAdmin = await this.admin.auth.getCurrentUser(req)
    if (!currentAdmin) throw new UnauthorizedException()
    req.currentAdmin = currentAdmin
    return true
  }
}

/**
 * Guard for `/admin/api/config`, the one endpoint that may legitimately be
 * answered without a session.
 *
 * It resolves the principal like `ModernAdminAuthGuard` does, but what it
 * does with an absent one depends on `ModernAdminModuleOptions.publicConfig`:
 *
 * - `false` (the default) — 401, same as every other admin endpoint. The SPA
 *   tolerates this: it fires the config query in parallel with the session
 *   check and re-runs it after login.
 * - `true` — the request proceeds anonymously. `ConfigController` then hands
 *   `null` to `admin.toJSON()`, which applies the same `isAccessible` /
 *   `isVisible` filtering as the authenticated path, with no principal. An
 *   anonymous caller therefore never sees more than a logged-in one.
 */
@Injectable()
export class ModernAdminConfigGuard implements CanActivate {
  constructor(
    @Inject(MODERN_ADMIN) private readonly admin: ModernAdmin,
    @Optional()
    @Inject(MODERN_ADMIN_OPTIONS)
    private readonly options?: ModernAdminModuleOptions,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AdminRequest>()
    const currentAdmin = await this.resolve(req)
    if (currentAdmin) {
      req.currentAdmin = currentAdmin
      return true
    }
    if (this.options?.publicConfig) return true
    throw new UnauthorizedException()
  }

  private async resolve(req: AdminRequest): Promise<unknown> {
    try {
      return await this.admin.auth.getCurrentUser(req)
    } catch {
      return null
    }
  }
}
