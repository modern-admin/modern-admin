import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  NotImplementedException,
  Optional,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger'
import {
  ActionNotFoundError,
  ForbiddenError,
  type ModernAdmin,
  RecordNotFoundError,
  ResourceNotFoundError,
  ValidationError,
  type ActionResponse,
  type CurrentAdmin,
  type HistoryEntry,
} from '@modern-admin/core'
import { z } from 'zod'
import { ModernAdminAuthGuard } from './auth.guard.js'
import type { ModernAdminModuleOptions } from './module.js'
import { MODERN_ADMIN, MODERN_ADMIN_OPTIONS } from './tokens.js'

interface AdminRequest {
  currentAdmin?: CurrentAdmin
}

const listQueryZ = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

const revertBodyZ = z.object({
  reason: z.string().max(500).optional(),
})

export interface HistoryListResponse {
  revisions: HistoryEntry[]
}

export interface HistoryRevisionResponse {
  revision: HistoryEntry
}

@ApiTags('Admin / History')
@ApiCookieAuth('session')
@Controller('admin/api/resources/:resourceId/records/:recordId/history')
@UseGuards(ModernAdminAuthGuard)
export class HistoryController {
  constructor(
    @Inject(MODERN_ADMIN) private readonly admin: ModernAdmin,
    @Optional()
    @Inject(MODERN_ADMIN_OPTIONS)
    private readonly options?: ModernAdminModuleOptions,
  ) {}

  @Get()
  async list(
    @Param('resourceId') resourceId: string,
    @Param('recordId') recordId: string,
    @Query() rawQuery: Record<string, unknown>,
    @Req() req: AdminRequest,
  ): Promise<HistoryListResponse> {
    this.assertAllowed(req.currentAdmin)
    const store = this.requireStore()
    const query = listQueryZ.parse(rawQuery)
    const revisions = await store.list(resourceId, recordId, {
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    })
    return { revisions }
  }

  @Get(':revisionId')
  async get(
    @Param('resourceId') resourceId: string,
    @Param('recordId') recordId: string,
    @Param('revisionId') revisionId: string,
    @Req() req: AdminRequest,
  ): Promise<HistoryRevisionResponse> {
    this.assertAllowed(req.currentAdmin)
    const revision = await this.requireRevision(resourceId, recordId, revisionId)
    return { revision }
  }

  @Post(':revisionId/revert')
  async revert(
    @Param('resourceId') resourceId: string,
    @Param('recordId') recordId: string,
    @Param('revisionId') revisionId: string,
    @Body() body: unknown,
    @Req() req: AdminRequest,
  ): Promise<ActionResponse> {
    this.assertAllowed(req.currentAdmin)
    const { reason } = revertBodyZ.parse(body ?? {})
    const revision = await this.requireRevision(resourceId, recordId, revisionId)
    // "Revert" undoes the change introduced by `revision` — it restores the
    // record to the state captured _before_ that revision was applied.
    // Older entries written before `snapshotBefore` was tracked fall back
    // to `snapshot` so the endpoint never 500s, but they will be a no-op.
    const target = revision.snapshotBefore ?? revision.snapshot
    if (!target || Object.keys(target).length === 0) {
      throw new BadRequestException('This revision cannot be reverted')
    }
    try {
      return await this.admin.invoke(
        {
          params: { resourceId, recordId, action: 'edit' },
          method: 'patch',
          payload: target,
          meta: { revertedFromRevisionId: revision.id, ...(reason ? { reason } : {}) },
        },
        req.currentAdmin,
      )
    } catch (err) {
      throw mapAdminError(err)
    }
  }

  private requireStore(): NonNullable<ModernAdminModuleOptions['historyStore']> {
    const store = this.options?.historyStore
    if (!store) throw new NotImplementedException('Record history store is not configured')
    return store
  }

  private async requireRevision(
    resourceId: string,
    recordId: string,
    revisionId: string,
  ): Promise<HistoryEntry> {
    const revision = await this.requireStore().get(resourceId, recordId, revisionId)
    if (!revision) throw new NotFoundException('Revision not found')
    return revision
  }

  private assertAllowed(admin: CurrentAdmin | undefined): void {
    const allowed = this.options?.historyRoles ?? ['admin']
    const role = admin?.role
    if (role === undefined || !allowed.includes(String(role))) {
      throw new ForbiddenException('History is not available')
    }
  }
}

const mapAdminError = (err: unknown): unknown => {
  if (err instanceof ForbiddenError) return new ForbiddenException(err.message)
  if (
    err instanceof ResourceNotFoundError ||
    err instanceof ActionNotFoundError ||
    err instanceof RecordNotFoundError
  ) {
    return new NotFoundException(err.message)
  }
  if (err instanceof ValidationError) {
    return new BadRequestException({
      message: err.message,
      propertyErrors: err.propertyErrors,
      baseError: err.baseError,
    })
  }
  return err
}
