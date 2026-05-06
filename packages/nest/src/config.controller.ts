import { Controller, Get, Inject } from '@nestjs/common'
import { ModernAdmin } from '@modern-admin/core'
import { MODERN_ADMIN } from './tokens.js'

/**
 * Public, unauthenticated config snapshot used by the SPA to bootstrap. The
 * payload mirrors `ModernAdmin#toJSON()` and intentionally excludes anything
 * that would leak resource state.
 */
@Controller('admin/api/config')
export class ConfigController {
  constructor(@Inject(MODERN_ADMIN) private readonly admin: ModernAdmin) {}

  @Get()
  get(): ReturnType<ModernAdmin['toJSON']> {
    return this.admin.toJSON()
  }
}
