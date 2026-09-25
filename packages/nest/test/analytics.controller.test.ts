// `POST /admin/api/timeseries` aggregates record data outside `invoke()`, so
// it has to apply the `list` gate itself: resource-level access (role /
// `isAccessible` / api-key allowlist) and property-level access for every
// aggregated column. It used to aggregate any resource for any principal.

import { describe, expect, test } from 'bun:test'
import { ForbiddenException } from '@nestjs/common'
import {
  type ActionContext,
  BaseProperty,
  type CurrentAdmin,
  type Filter,
  ModernAdmin,
  type PropertyContext,
  type TimeSeriesQuery,
  type TimeSeriesResult,
} from '@modern-admin/core'
import { AnalyticsController } from '../src/analytics.controller.js'
import { FakeDatabase, FakeResource, type FakeTable } from './_helpers/fake-adapter.js'

const queries: TimeSeriesQuery[] = []

class ChartResource extends FakeResource {
  override properties(): BaseProperty[] {
    return [
      new BaseProperty({ path: 'id', isId: true }),
      new BaseProperty({ path: 'name', type: 'string' }),
      new BaseProperty({ path: 'createdAt', type: 'datetime' }),
      new BaseProperty({ path: 'amount', type: 'number' }),
      new BaseProperty({ path: 'salary', type: 'number' }),
      new BaseProperty({ path: 'customerId', type: 'string' }),
    ]
  }
  override supportsTimeSeries(): boolean {
    return true
  }
  override async aggregateTimeSeries(
    _filter: Filter,
    query: TimeSeriesQuery,
  ): Promise<TimeSeriesResult> {
    queries.push(query)
    return { series: [{ key: 'c1', points: [{ date: '2026-01-01', value: 1 }] }] }
  }
}

class ChartDatabase extends FakeDatabase {
  constructor(private readonly chartTables: FakeTable[]) {
    super(chartTables)
  }
  override resources(): FakeResource[] {
    return this.chartTables.map((t) => new ChartResource(t))
  }
}

const adminOnly = (ctx: ActionContext | PropertyContext): boolean =>
  ctx.currentAdmin?.role === 'admin'

const buildController = (): AnalyticsController => {
  const admin = new ModernAdmin({
    adapters: [{ Database: ChartDatabase, Resource: ChartResource } as never],
    resources: [
      {
        resource: { name: 'payments', rows: [] },
        options: { properties: { salary: { isAccessible: adminOnly } } },
      },
      {
        resource: { name: 'customers', rows: [{ id: 'c1', name: 'Ann' }] },
        options: { actions: { list: { isAccessible: adminOnly } } },
      },
    ],
  })
  return new AnalyticsController(admin)
}

const body = (overrides: Record<string, unknown> = {}) => ({
  resource: 'payments',
  dateField: 'createdAt',
  step: 'day',
  metric: 'sum',
  field: 'amount',
  from: '2026-01-01T00:00:00.000Z',
  to: '2026-02-01T00:00:00.000Z',
  ...overrides,
})

const admin: CurrentAdmin = { id: 'u1', role: 'admin' }
const viewer: CurrentAdmin = { id: 'u2', role: 'viewer' }

describe('AnalyticsController — access gate', () => {
  test('a principal that may list the resource gets the series', async () => {
    const res = await buildController().timeseries(body(), { currentAdmin: viewer })
    expect(res.supported).toBe(true)
    expect(res.series).toHaveLength(1)
  })

  test('a resource the role cannot list is refused before aggregating', async () => {
    queries.length = 0
    await expect(
      buildController().timeseries(body({ resource: 'customers', field: undefined }), {
        currentAdmin: viewer,
      }),
    ).rejects.toThrow(ForbiddenException)
    expect(queries).toHaveLength(0)
  })

  test('aggregating a property the role cannot read is refused', async () => {
    queries.length = 0
    const ctrl = buildController()
    await expect(
      ctrl.timeseries(body({ field: 'salary' }), { currentAdmin: viewer }),
    ).rejects.toThrow(/Property "salary"/)
    await expect(
      ctrl.timeseries(body({ metric: 'count', field: undefined, groupBy: 'salary' }), {
        currentAdmin: viewer,
      }),
    ).rejects.toThrow(ForbiddenException)
    expect(queries).toHaveLength(0)

    const res = await ctrl.timeseries(body({ field: 'salary' }), { currentAdmin: admin })
    expect(res.supported).toBe(true)
  })

  test("an API key is held to its allowlist, not its owner's role", async () => {
    const key: CurrentAdmin = {
      ...admin,
      apiKey: { id: 'k1', permissions: { customers: ['list'] } },
    }
    await expect(buildController().timeseries(body(), { currentAdmin: key })).rejects.toThrow(
      ForbiddenException,
    )
  })

  test('FK labels are resolved only from a resource the caller may list', async () => {
    const ctrl = buildController()
    const labelled = body({ metric: 'count', field: undefined, groupBy: 'customerId' })
    const denied = await ctrl.timeseries(
      { ...labelled, groupByLabelResource: 'customers' },
      { currentAdmin: viewer },
    )
    expect(denied.resolvedLabels).toBeUndefined()

    const allowed = await ctrl.timeseries(
      { ...labelled, groupByLabelResource: 'customers' },
      { currentAdmin: admin },
    )
    expect(allowed.resolvedLabels).toEqual({ c1: 'Ann' })
  })
})
