import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common'
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { type ModernAdmin, type CurrentAdmin } from '@modern-admin/core'
import { MODERN_ADMIN } from './tokens.js'
import { AllowApiKey, ModernAdminAuthGuard } from './auth.guard.js'

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
  constructor(@Inject(MODERN_ADMIN) private readonly admin: ModernAdmin) {}

  @ApiCookieAuth('session')
  @ApiOperation({ summary: 'Resolve the current authenticated admin' })
  @Get('me')
  @UseGuards(ModernAdminAuthGuard)
  @AllowApiKey()
  me(@Req() req: AdminRequest): { user: CurrentAdmin } {
    // Guard guarantees presence; the bang is just to satisfy the type.
    // The role's permission matrix is deliberately *not* returned: the SPA
    // decides what to render from `/admin/api/config`, whose action
    // descriptors are already pruned per principal by `toJSON(currentAdmin)`.
    // Shipping the raw matrix as well invited a second, divergent copy of the
    // same verdict — and handed an authenticated caller the whole map of what
    // it may not do, for no UI gain.
    return { user: req.currentAdmin! }
  }

  @ApiOperation({ summary: 'Public auth UI metadata (login providers etc.)' })
  @Get('ui-props')
  uiProps(): Record<string, unknown> {
    return this.admin.auth.getUiProps()
  }
}
