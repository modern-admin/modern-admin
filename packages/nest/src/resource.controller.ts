import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger'
import {
  ForbiddenError,
  ActionNotFoundError,
  RecordNotFoundError,
  ResourceNotFoundError,
  ValidationError,
  type ActionRequest,
  type ActionResponse,
  type ModernAdmin,
} from '@modern-admin/core'
import { MODERN_ADMIN } from './tokens.js'
import { ModernAdminAuthGuard } from './auth.guard.js'
import {
  bulkBodyZ,
  createBodyZ,
  listQueryZ,
  updateBodyZ,
} from './dto.js'

interface AdminRequest {
  currentAdmin?: { id: string; [key: string]: unknown }
  [key: string]: unknown
}

/**
 * Single dynamic controller wired against `ModernAdmin.invoke()`. Routes mirror
 * the AdminJS REST shape so the React client can be ported with minimal
 * adjustments. Each handler maps an HTTP request to an ActionRequest and
 * funnels it through `admin.invoke()`, sharing hook/auth semantics with
 * GraphQL/WS transports.
 */
@ApiTags('Admin / Resources')
@ApiCookieAuth('session')
@Controller('admin/api/resources/:resourceId')
@UseGuards(ModernAdminAuthGuard)
export class ResourceController {
  constructor(@Inject(MODERN_ADMIN) private readonly admin: ModernAdmin) {}

  @Get('actions/list')
  async list(
    @Param('resourceId') resourceId: string,
    @Query() rawQuery: Record<string, unknown>,
    @Req() req: AdminRequest,
  ): Promise<ActionResponse> {
    const query = listQueryZ.parse(rawQuery)
    return this.run(
      {
        params: { resourceId, action: 'list' },
        method: 'get',
        query,
      },
      req,
    )
  }

  @Get('records/:recordId/actions/show')
  async show(
    @Param('resourceId') resourceId: string,
    @Param('recordId') recordId: string,
    @Req() req: AdminRequest,
  ): Promise<ActionResponse> {
    return this.run(
      { params: { resourceId, recordId, action: 'show' }, method: 'get' },
      req,
    )
  }

  @Post('actions/new')
  async create(
    @Param('resourceId') resourceId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: AdminRequest,
  ): Promise<ActionResponse> {
    const payload = createBodyZ.parse(body)
    return this.run(
      { params: { resourceId, action: 'new' }, method: 'post', payload },
      req,
    )
  }

  @Patch('records/:recordId/actions/edit')
  async edit(
    @Param('resourceId') resourceId: string,
    @Param('recordId') recordId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: AdminRequest,
  ): Promise<ActionResponse> {
    const payload = updateBodyZ.parse(body)
    return this.run(
      {
        params: { resourceId, recordId, action: 'edit' },
        method: 'patch',
        payload,
      },
      req,
    )
  }

  @Delete('records/:recordId/actions/delete')
  async remove(
    @Param('resourceId') resourceId: string,
    @Param('recordId') recordId: string,
    @Req() req: AdminRequest,
  ): Promise<ActionResponse> {
    return this.run(
      { params: { resourceId, recordId, action: 'delete' }, method: 'delete' },
      req,
    )
  }

  @Post('actions/bulkDelete')
  async bulkDelete(
    @Param('resourceId') resourceId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: AdminRequest,
  ): Promise<ActionResponse> {
    const { recordIds } = bulkBodyZ.parse(body)
    return this.run(
      {
        params: { resourceId, action: 'bulkDelete', recordIds: recordIds.join(',') },
        method: 'post',
      },
      req,
    )
  }

  @Get('actions/values')
  async values(
    @Param('resourceId') resourceId: string,
    @Query('field') field: string | undefined,
    @Query('search') search: string | undefined,
    @Query('limit') limit: string | undefined,
    @Req() req: AdminRequest,
  ): Promise<ActionResponse> {
    return this.run(
      {
        params: { resourceId, action: 'values' },
        method: 'get',
        query: {
          field: field ?? '',
          search: search ?? '',
          ...(limit ? { limit } : {}),
        },
      },
      req,
    )
  }

  @Get('actions/search')
  async search(
    @Param('resourceId') resourceId: string,
    @Query('q') q: string | undefined,
    @Req() req: AdminRequest,
  ): Promise<ActionResponse> {
    return this.run(
      {
        params: { resourceId, action: 'search', query: q ?? '' },
        method: 'get',
        query: { q },
      },
      req,
    )
  }

  // ── Custom actions ───────────────────────────────────────────────────────
  // These parameterised routes sit AFTER all static routes so Nest's router
  // matches `actions/list`, `actions/new`, `actions/bulkDelete`, `actions/search`
  // as specific handlers first, and only falls through to the wildcard for
  // truly custom action names.

  /** Invoke a custom record-scoped action (actionType: 'record'). */
  @Post('records/:recordId/actions/:action')
  async invokeRecordAction(
    @Param('resourceId') resourceId: string,
    @Param('recordId') recordId: string,
    @Param('action') action: string,
    @Body() body: Record<string, unknown> | undefined,
    @Req() req: AdminRequest,
  ): Promise<ActionResponse> {
    return this.run(
      { params: { resourceId, recordId, action }, method: 'post', payload: body ?? {} },
      req,
    )
  }

  /** Invoke a custom resource- or bulk-scoped action.
   *  For bulk actions pass `{ recordIds: string[] }` in the body. */
  @Post('actions/:action')
  async invokeResourceAction(
    @Param('resourceId') resourceId: string,
    @Param('action') action: string,
    @Body() body: Record<string, unknown> | undefined,
    @Req() req: AdminRequest,
  ): Promise<ActionResponse> {
    const { recordIds, ...payload } = (body ?? {}) as { recordIds?: string[]; [k: string]: unknown }
    return this.run(
      {
        params: {
          resourceId,
          action,
          ...(recordIds?.length ? { recordIds: recordIds.join(',') } : {}),
        },
        method: 'post',
        payload,
      },
      req,
    )
  }

  private async run(request: ActionRequest, req: AdminRequest): Promise<ActionResponse> {
    try {
      return await this.admin.invoke(request, req.currentAdmin)
    } catch (err) {
      throw mapAdminError(err)
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
