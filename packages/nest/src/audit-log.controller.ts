import {
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotImplementedException,
  Optional,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger'
import type { ActionLogEntry, CurrentAdmin } from '@modern-admin/core'
import { z } from 'zod'
import { ModernAdminAuthGuard } from './auth.guard.js'
import type { ModernAdminModuleOptions } from './module.js'
import { MODERN_ADMIN_OPTIONS } from './tokens.js'

interface AdminRequest {
  currentAdmin?: CurrentAdmin
}

const queryZ = z.object({
  resourceId: z.string().min(1).optional(),
  recordId: z.string().min(1).optional(),
  userId: z.string().min(1).optional(),
  actions: z.string().min(1).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  before: z.coerce.number().int().min(0).optional(),
})

export interface AuditLogResponse {
  events: ActionLogEntry[]
}

@ApiTags('Admin / Audit Log')
@ApiCookieAuth('session')
@Controller('admin/api/audit-log')
@UseGuards(ModernAdminAuthGuard)
export class AuditLogController {
  constructor(
    @Optional()
    @Inject(MODERN_ADMIN_OPTIONS)
    private readonly options?: ModernAdminModuleOptions,
  ) {}

  @Get()
  async list(
    @Query() rawQuery: Record<string, unknown>,
    @Req() req: AdminRequest,
  ): Promise<AuditLogResponse> {
    this.assertAllowed(req.currentAdmin)
    const store = this.options?.logStore
    if (!store?.list) throw new NotImplementedException('Queryable log store is not configured')
    const query = queryZ.parse(rawQuery)
    const events = await store.list({
      ...(query.resourceId ? { resourceId: query.resourceId } : {}),
      ...(query.recordId ? { recordId: query.recordId } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.actions
        ? { actions: query.actions.split(',').map((s) => s.trim()).filter(Boolean) }
        : {}),
      ...(query.from ? { from: new Date(query.from) } : {}),
      ...(query.to ? { to: new Date(query.to) } : {}),
      ...(query.before != null ? { before: query.before } : {}),
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    })
    return { events }
  }

  private assertAllowed(admin: CurrentAdmin | undefined): void {
    const allowed = this.options?.auditLogRoles ?? ['admin']
    const role = admin?.role
    if (role === undefined || !allowed.includes(String(role))) {
      throw new ForbiddenException('Audit log is not available')
    }
  }
}
