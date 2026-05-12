import { Controller, Get, Inject, Optional, Post, Req, UseGuards } from '@nestjs/common'
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ModernAdmin, type CurrentAdmin, type RolePermissions, uuidv7 } from '@modern-admin/core'
import { MODERN_ADMIN, MODERN_ADMIN_OPTIONS } from './tokens.js'
import { ModernAdminAuthGuard } from './auth.guard.js'
import type { ModernAdminModuleOptions } from './module.js'

interface AdminRequest {
  currentAdmin?: CurrentAdmin
}

/**
 * Exposes the current admin to the SPA. The guard runs first and either
 * stores the session principal on `req.currentAdmin` or throws 401 — the
 * frontend uses the 401 as its "show login screen" signal.
 */
@ApiTags('Admin / Auth')
@Controller('admin/api/auth')
export class AuthController {
  constructor(
    @Inject(MODERN_ADMIN) private readonly admin: ModernAdmin,
    @Optional() @Inject(MODERN_ADMIN_OPTIONS) private readonly options?: ModernAdminModuleOptions,
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

  @ApiCookieAuth('session')
  @ApiOperation({ summary: 'Record a successful login event in the audit log' })
  @Post('login')
  @UseGuards(ModernAdminAuthGuard)
  async logLogin(
    @Req() req: AdminRequest,
  ): Promise<{ user: CurrentAdmin; permissions: RolePermissions | null }> {
    const user = req.currentAdmin!
    const store = this.options?.logStore
    if (store) {
      void store.record({
        id: uuidv7(),
        resourceId: '__auth__',
        action: 'login',
        userId: user.id,
        recordTitle: user.email ?? user.name,
        at: Date.now(),
      })
    }
    const permissions = await this.admin.getRolePermissions(user.role)
    return { user, permissions }
  }

  @ApiOperation({ summary: 'Public auth UI metadata (login providers etc.)' })
  @Get('ui-props')
  uiProps(): Record<string, unknown> {
    return this.admin.auth.getUiProps()
  }
}
