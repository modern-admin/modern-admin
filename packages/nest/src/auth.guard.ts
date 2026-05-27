import { type CanActivate, type ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { type ModernAdmin } from '@modern-admin/core'
import { MODERN_ADMIN } from './tokens.js'

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
