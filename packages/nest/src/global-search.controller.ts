import {
  Controller,
  Get,
  Inject,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger'
import {
  ForbiddenError,
  ModernAdmin,
  type ListActionResponse,
  type RecordJSON,
  type CurrentAdmin,
} from '@modern-admin/core'
import { z } from 'zod'
import { MODERN_ADMIN } from './tokens.js'
import { ModernAdminAuthGuard } from './auth.guard.js'

interface AdminRequest {
  currentAdmin?: CurrentAdmin
}

const queryZ = z.object({
  q: z.string().trim().min(1).max(200),
  /** Max hits per resource. Default 5. */
  perResourceLimit: z.coerce.number().int().min(1).max(20).optional(),
})

export interface GlobalSearchHit {
  resourceId: string
  resourceName: string
  recordId: string
  title: string
}

export interface GlobalSearchGroup {
  resourceId: string
  resourceName: string
  records: GlobalSearchHit[]
}

export interface GlobalSearchResponse {
  query: string
  groups: GlobalSearchGroup[]
  total: number
}

/**
 * Cross-resource search: fans `q` out to every registered resource's built-in
 * `search` action via `ModernAdmin.invoke()`. Per-resource access gates
 * (api-key / role / `isAccessible`) are honoured — denied resources are
 * silently skipped so the dropdown only surfaces what the principal can see.
 */
@ApiTags('Admin / Global Search')
@ApiCookieAuth('session')
@Controller('admin/api/global-search')
@UseGuards(ModernAdminAuthGuard)
export class GlobalSearchController {
  constructor(@Inject(MODERN_ADMIN) private readonly admin: ModernAdmin) {}

  @Get()
  async search(
    @Query() rawQuery: Record<string, unknown>,
    @Req() req: AdminRequest,
  ): Promise<GlobalSearchResponse> {
    const { q, perResourceLimit } = queryZ.parse(rawQuery)
    const limit = perResourceLimit ?? 5

    const results = await Promise.all(
      this.admin.resources.map(async (resource): Promise<GlobalSearchGroup | null> => {
        const decorated = resource.decorate()
        // Skip resources where the `search` action is not defined (custom
        // resources may opt out by overriding their action list).
        if (!decorated.getAction('search')) return null
        try {
          const response = (await this.admin.invoke(
            {
              params: { resourceId: decorated.id, action: 'search', query: q },
              method: 'get',
              query: { q },
            },
            req.currentAdmin,
          )) as ListActionResponse
          const records = (response.records ?? []).slice(0, limit)
          if (records.length === 0) return null
          return {
            resourceId: decorated.id,
            resourceName: decorated.name,
            records: records.map((r: RecordJSON) => ({
              resourceId: decorated.id,
              resourceName: decorated.name,
              recordId: String(r.id),
              title: r.title ?? String(r.id),
            })),
          }
        } catch (err) {
          // Access denied / search not accessible → drop silently. Anything
          // else is swallowed too so one broken adapter cannot poison the
          // whole palette; the caller still sees results from healthy ones.
          if (err instanceof ForbiddenError) return null
          return null
        }
      }),
    )

    const groups = results.filter((g): g is GlobalSearchGroup => g !== null)
    const total = groups.reduce((sum, g) => sum + g.records.length, 0)
    return { query: q, groups, total }
  }
}
