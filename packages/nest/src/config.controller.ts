import { Controller, Get, Inject, Req } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { type ModernAdmin, type CurrentAdmin, type ModernAdminJSON } from '@modern-admin/core'
import { MODERN_ADMIN } from './tokens.js'

interface AdminRequest {
  currentAdmin?: CurrentAdmin
}

/**
 * Public, unauthenticated config snapshot used by the SPA to bootstrap. The
 * payload mirrors `ModernAdmin#toJSON()` and intentionally excludes anything
 * that would leak resource state.
 */
@ApiTags('Admin / Config')
@Controller('admin/api/config')
export class ConfigController {
  constructor(@Inject(MODERN_ADMIN) private readonly admin: ModernAdmin) {}

  @ApiOperation({ summary: 'Bootstrap config (resources, branding, locales)' })
  @Get()
  async get(@Req() req: AdminRequest): Promise<ModernAdminJSON> {
    const currentAdmin = req.currentAdmin ?? await this.resolveCurrentAdmin(req)
    return currentAdmin ? this.admin.toJSON(currentAdmin) : this.admin.toJSON()
  }

  private async resolveCurrentAdmin(req: AdminRequest): Promise<CurrentAdmin | undefined> {
    try {
      return (await this.admin.auth.getCurrentUser(req)) ?? undefined
    } catch {
      return undefined
    }
  }
}
