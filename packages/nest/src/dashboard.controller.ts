import {
  Body,
  Controller,
  Get,
  Inject,
  Optional,
  Put,
  UseGuards,
} from '@nestjs/common'
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { EMPTY_DASHBOARD, dashboardBlobZ, type DashboardBlob } from '@modern-admin/core'
import { MODERN_ADMIN_OPTIONS } from './tokens.js'
import { ModernAdminAuthGuard } from './auth.guard.js'
import type { ModernAdminModuleOptions } from './module.js'

/**
 * GET  /admin/api/dashboard — load per-user dashboard blob from configStore.
 * PUT  /admin/api/dashboard — persist updated dashboard blob.
 *
 * Falls back to `EMPTY_DASHBOARD` when `configStore` is not configured so the
 * UI always gets a valid response and gracefully degrades to localStorage.
 */
@ApiTags('Admin / Dashboard')
@ApiCookieAuth('session')
@Controller('admin/api/dashboard')
@UseGuards(ModernAdminAuthGuard)
export class DashboardController {
  constructor(
    @Optional()
    @Inject(MODERN_ADMIN_OPTIONS)
    private readonly options?: ModernAdminModuleOptions,
  ) {}

  @ApiOperation({ summary: 'Load the shared dashboard layout (global, all admins see the same charts)' })
  @Get()
  async load(): Promise<{ dashboard: DashboardBlob }> {
    const store = this.options?.configStore
    if (!store) return { dashboard: EMPTY_DASHBOARD }
    const raw = await store.get('global', null, 'dashboard:v1')
    const parsed = dashboardBlobZ.safeParse(raw)
    return { dashboard: parsed.success ? parsed.data : EMPTY_DASHBOARD }
  }

  @ApiOperation({ summary: 'Save the shared dashboard layout' })
  @Put()
  async save(
    @Body() body: unknown,
  ): Promise<{ ok: boolean }> {
    const store = this.options?.configStore
    if (!store) return { ok: true }
    const parsed = dashboardBlobZ.safeParse(body)
    if (!parsed.success) return { ok: false }
    await store.set('global', null, 'dashboard:v1', parsed.data)
    return { ok: true }
  }
}
