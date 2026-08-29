import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Optional,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger'
import {
  type CacheRuntimeStats,
  type CurrentAdmin,
  ModernAdmin,
  ResourceNotFoundError,
} from '@modern-admin/core'
import { z } from 'zod'
import { ModernAdminAuthGuard } from './auth.guard.js'
import type { ModernAdminModuleOptions } from './module.js'
import { MODERN_ADMIN, MODERN_ADMIN_OPTIONS } from './tokens.js'

interface AdminRequest {
  currentAdmin?: CurrentAdmin
}

const invalidateBodyZ = z.object({ resourceId: z.string().min(1) })

export type CacheStatsResponse = CacheRuntimeStats

@ApiTags('Admin / Cache')
@ApiCookieAuth('session')
@Controller('admin/api/cache')
@UseGuards(ModernAdminAuthGuard)
export class CacheController {
  constructor(
    @Inject(MODERN_ADMIN) private readonly admin: ModernAdmin,
    @Optional()
    @Inject(MODERN_ADMIN_OPTIONS)
    private readonly options?: ModernAdminModuleOptions,
  ) {}

  @Get('stats')
  stats(@Req() req: AdminRequest): CacheStatsResponse {
    this.assertAllowed(req.currentAdmin)
    return this.admin.cacheRuntime.stats()
  }

  @Post('stats/reset')
  resetStats(@Req() req: AdminRequest): CacheStatsResponse {
    this.assertAllowed(req.currentAdmin)
    this.admin.cacheRuntime.stats(true)
    return this.admin.cacheRuntime.stats()
  }

  @Post('invalidate')
  async invalidate(@Body() body: unknown, @Req() req: AdminRequest): Promise<{ ok: true }> {
    this.assertAllowed(req.currentAdmin)
    const parsed = invalidateBodyZ.safeParse(body)
    if (!parsed.success) throw new BadRequestException(parsed.error.message)
    try {
      this.admin.findResource(parsed.data.resourceId)
    } catch (error) {
      if (error instanceof ResourceNotFoundError) throw new NotFoundException(error.message)
      throw error
    }
    await this.admin.invalidateResourceCaches(parsed.data.resourceId)
    return { ok: true }
  }

  private assertAllowed(admin: CurrentAdmin | undefined): void {
    const allowed = this.options?.cacheRoles ?? ['admin']
    const role = admin?.role
    if (admin?.apiKey || role === undefined || !allowed.includes(String(role))) {
      throw new ForbiddenException()
    }
  }
}
