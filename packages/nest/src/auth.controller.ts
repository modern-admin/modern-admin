import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common'
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { type ModernAdmin, type CurrentAdmin, type RolePermissions } from '@modern-admin/core'
import { MODERN_ADMIN } from './tokens.js'
import { ModernAdminAuthGuard } from './auth.guard.js'

interface AdminRequest {
  currentAdmin?: CurrentAdmin
}

/**
 * Exposes the current admin to the SPA. The guard runs first and either
 * stores the session principal on `req.currentAdmin` or throws 401 — the
 * frontend uses the 401 as its "show login screen" signal.
 *
 * Login events are recorded server-side by Better Auth's
 * `session.create.after` hook (wired in `apps/_shared/src/auth/build-better-auth.ts`),
 * which covers email/password, OAuth, passkey and api-key flows uniformly.
 */
@ApiTags('Admin / Auth')
@Controller('admin/api/auth')
export class AuthController {
  constructor(
    @Inject(MODERN_ADMIN) private readonly admin: ModernAdmin,
  ) {}

  @ApiCookieAuth('session')
  @ApiOperation({ summary: 'Resolve the current authenticated admin' })
  @Get('me')
  @UseGuards(ModernAdminAuthGuard)
  async me(
    @Req() req: AdminRequest,
  ): Promise<{ user: CurrentAdmin; permissions: RolePermissions | null }> {
    // Guard guarantees presence; the bang is just to satisfy the type.
    const user = req.currentAdmin!
    // Resolve effective permissions so the SPA can hide buttons it
    // can't use. Server-side enforcement still runs in `invoke()` —
    // this is a UI hint only, not a trust boundary.
    const permissions = await this.admin.getRolePermissions(user.role)
    return { user, permissions }
  }

  @ApiOperation({ summary: 'Public auth UI metadata (login providers etc.)' })
  @Get('ui-props')
  uiProps(): Record<string, unknown> {
    return this.admin.auth.getUiProps()
  }
}
