import { Body, Controller, Inject, Optional, Post, Req, UseGuards } from '@nestjs/common'
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Filter, type ModernAdmin, NotImplementedError } from '@modern-admin/core'
import type {
  AggregationOp,
  CurrentAdmin,
  TimeSeriesQuery,
  TimeSeriesResult,
  TimeSeriesStep,
} from '@modern-admin/core'
import { z } from 'zod'
import { MODERN_ADMIN, MODERN_ADMIN_OPTIONS } from './tokens.js'
import { ModernAdminAuthGuard } from './auth.guard.js'
import type { ModernAdminModuleOptions } from './module.js'

const stepZ = z.enum(['day', 'week', 'month', 'year', 'all'])
const metricZ = z.enum(['count', 'sum', 'avg', 'min', 'max'])

const requestZ = z.object({
  resource: z.string().min(1),
  dateField: z.string().min(1),
  step: stepZ,
  metric: metricZ,
  field: z.string().min(1).optional(),
  groupBy: z.string().min(1).optional(),
  topN: z.number().int().min(1).max(50).optional(),
  from: z.iso.datetime(),
  to: z.iso.datetime(),
  filters: z.record(z.string(), z.string()).optional(),
  comparePrevious: z.boolean().optional(),
  /** Resource id whose records the groupBy series keys (FK ids) belong to. */
  groupByLabelResource: z.string().min(1).optional(),
})

export type TimeSeriesRequest = z.infer<typeof requestZ>

export interface TimeSeriesResponse extends TimeSeriesResult {
  /**
   * Whether time-series queries are supported on this resource. When `false`,
   * the UI displays the "your DB doesn't support charts" message and `series`
   * is empty.
   */
  supported: boolean
  /**
   * Populated when `groupByLabelResource` was requested — maps each FK series
   * key (the raw id) to the referenced record's title string.
   */
  resolvedLabels?: Record<string, string>
}

interface AdminRequest {
  currentAdmin?: CurrentAdmin
}

/**
 * POST /admin/api/timeseries
 *
 * Single endpoint powering every chart on the dashboard. KPI mode is just
 * `step: 'all'`. Multi-series breakdown via `groupBy`, top-N truncation
 * happens adapter-side.
 *
 * The raw SQL string captured by the adapter is forwarded to the client only
 * when the caller's role is in `timeseriesSqlRoles` (default `['admin']`).
 */
@ApiTags('Admin / Analytics')
@ApiCookieAuth('session')
@Controller('admin/api')
@UseGuards(ModernAdminAuthGuard)
export class AnalyticsController {
  constructor(
    @Inject(MODERN_ADMIN) private readonly admin: ModernAdmin,
    @Optional()
    @Inject(MODERN_ADMIN_OPTIONS)
    private readonly options?: ModernAdminModuleOptions,
  ) {}

  @ApiOperation({ summary: 'Aggregate time-series for a resource (KPI = step:"all")' })
  @Post('timeseries')
  async timeseries(
    @Body() body: unknown,
    @Req() req: AdminRequest,
  ): Promise<TimeSeriesResponse> {
    const parsed = requestZ.parse(body)

    let resource
    try {
      resource = this.admin.findResource(parsed.resource)
    } catch {
      return { series: [], supported: false }
    }

    if (!resource.supportsTimeSeries()) {
      return { series: [], supported: false }
    }

    const filter = new Filter((parsed.filters ?? {}) as never, resource)

    const query: TimeSeriesQuery = {
      dateField: parsed.dateField,
      step: parsed.step as TimeSeriesStep,
      metric: parsed.metric as AggregationOp,
      ...(parsed.field ? { field: parsed.field } : {}),
      ...(parsed.groupBy ? { groupBy: parsed.groupBy } : {}),
      ...(parsed.topN !== undefined ? { topN: parsed.topN } : {}),
      from: new Date(parsed.from),
      to: new Date(parsed.to),
      ...(parsed.filters ? { filters: parsed.filters } : {}),
      ...(parsed.comparePrevious ? { comparePrevious: true } : {}),
    }

    let result: TimeSeriesResult
    try {
      result = await resource.aggregateTimeSeries(filter, query)
    } catch (err) {
      if (err instanceof NotImplementedError) {
        return { series: [], supported: false }
      }
      throw err
    }

    // Resolve FK groupBy series keys to human-readable titles.
    let resolvedLabels: Record<string, string> | undefined
    if (parsed.groupByLabelResource) {
      try {
        const refResource = this.admin.findResource(parsed.groupByLabelResource)
        const SPECIAL = new Set(['__total__', '__other__', '__null__'])
        const ids = [...new Set(result.series.map((s) => s.key).filter((k) => !SPECIAL.has(k)))]
        if (ids.length > 0) {
          const records = await refResource.findMany(ids)
          resolvedLabels = Object.fromEntries(records.map((r) => [r.id(), r.title()]))
        }
      } catch {
        // Silently skip — labels degrade to raw keys.
      }
    }

    // Strip SQL when caller's role is not allowed to inspect it.
    const sqlRoles = this.options?.timeseriesSqlRoles ?? ['admin']
    const role = req.currentAdmin?.role
    const canSeeSql = role !== undefined && sqlRoles.includes(role)
    const out: TimeSeriesResponse = {
      series: result.series,
      ...(result.previous ? { previous: result.previous } : {}),
      ...(canSeeSql && result.sql ? { sql: result.sql } : {}),
      ...(resolvedLabels ? { resolvedLabels } : {}),
      supported: true,
    }
    return out
  }
}
