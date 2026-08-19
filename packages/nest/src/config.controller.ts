import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common'
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { type ModernAdmin, type CurrentAdmin, type ModernAdminJSON } from '@modern-admin/core'
import { MODERN_ADMIN } from './tokens.js'
import { ModernAdminConfigGuard } from './auth.guard.js'

interface AdminRequest {
  currentAdmin?: CurrentAdmin
}

/**
 * Config snapshot used by the SPA to bootstrap: resources, branding, auth UI
 * props, and capability flags. No record data.
 *
 * Authenticated by default. Set `publicConfig: true` on the module options to
 * answer logged-out requests as well — the payload is then built with a `null`
 * principal, so `isAccessible` / `isVisible` still run and an anonymous caller
 * sees no more than a logged-in one. (Before v0.5.1 this endpoint was
 * unauthenticated *and* skipped that filtering, leaking every property path
 * and every action descriptor, `isVisible: false` ones included.)
 */
@ApiTags('Admin / Config')
@ApiCookieAuth('session')
@Controller('admin/api/config')
@UseGuards(ModernAdminConfigGuard)
export class ConfigController {
  constructor(@Inject(MODERN_ADMIN) private readonly admin: ModernAdmin) {}

  @ApiOperation({ summary: 'Bootstrap config (resources, branding, locales)' })
  @Get()
  async get(@Req() req: AdminRequest): Promise<ModernAdminJSON> {
    // `null` — not `undefined` — is the anonymous-but-filtered overload.
    // `undefined` would select the synchronous, unfiltered snapshot.
    return this.admin.toJSON(req.currentAdmin ?? null)
  }
}
