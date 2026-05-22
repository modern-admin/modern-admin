// Dashboard / chart-builder schemas and storage port.
//
// Source of truth for the on-disk shape of saved dashboards. Both the
// frontend (localStorage default) and any future server-side store
// implement the same `IDashboardStore` interface, so the UI is agnostic
// to where the data actually lives.

import { z } from 'zod'

// Pie removed in Phase 10 — time-series first means category-only charts
// don't fit the model.
export const chartVisualisationZ = z.enum(['kpi', 'line', 'area', 'bar'])
export type ChartVisualisation = z.infer<typeof chartVisualisationZ>

export const aggregationOpZ = z.enum(['count', 'sum', 'avg', 'min', 'max'])
export type AggregationOpName = z.infer<typeof aggregationOpZ>

// `'all'` collapses the whole window into one bucket (KPI mode).
export const aggregationStepZ = z.enum(['day', 'week', 'month', 'year', 'all'])
export type AggregationStep = z.infer<typeof aggregationStepZ>

export const timeRangePresetZ = z.enum(['7d', '30d', '90d', '1y', 'all', 'custom'])
export type TimeRangePreset = z.infer<typeof timeRangePresetZ>

/** Tile width on the dashboard grid. `'half'` = 1 of 2 columns at md+, `'full'` = full row. */
export const chartWidthZ = z.enum(['half', 'full'])
export type ChartWidth = z.infer<typeof chartWidthZ>

/**
 * Time range stored on a chart. Presets resolve to concrete from/to at
 * render time so cards always reflect "now" without re-saving.
 */
export const timeRangeZ = z.discriminatedUnion('preset', [
  z.object({preset: z.enum(['7d', '30d', '90d', '1y', 'all'])}),
  z.object({
    preset: z.literal('custom'),
    from: z.iso.date(),
    to: z.iso.date(),
  }),
])
export type TimeRange = z.infer<typeof timeRangeZ>

export const chartDefZ = z
  .object({
    id: z.uuid(),
    title: z.string().max(120).default(''),
    resource: z.string().min(1),
    visualisation: chartVisualisationZ,
    /** Property path of the date/datetime column used for X-axis bucketing. */
    dateField: z.string().min(1),
    /** Time bucket granularity. KPI charts always use `'all'`. */
    step: aggregationStepZ,
    metric: aggregationOpZ,
    /** Required for non-count metrics. */
    field: z.string().min(1).optional(),
    /** Optional secondary breakdown — produces one series per distinct value. */
    groupBy: z.string().min(1).optional(),
    /** Maximum series count for `groupBy`-charts; rest collapses to "other". */
    topN: z.number().int().min(1).max(50).default(10),
    /**
     * When `groupBy` produces FK ids (reference property), the analytics
     * endpoint resolves them to human-readable titles via `findMany` on this
     * resource id. Auto-set by the chart builder when it detects a reference
     * property in the `groupBy` selector.
     */
    groupByLabelResource: z.string().min(1).optional(),
    width: chartWidthZ.default('half'),
    filters: z.record(z.string(), z.string()).default({}),
    /**
     * Property paths exposed as "quick filters" above the chart on the
     * dashboard tile. Their values are taken from `filters` but the widget
     * lets the user tweak them inline and apply via a dedicated Apply button.
     */
    quickFilters: z.array(z.string()).default([]),
    timeRange: timeRangeZ,
    /**
     * Optional group membership. `undefined` means the chart is not assigned
     * to any group yet — when at least one group exists, ungrouped charts
     * are bucketed into the first group (by `order`) at display time.
     */
    groupId: z.uuid().optional(),
    /** Sort key within a group; lower numbers come first. Defaults to 0. */
    order: z.number().int().default(0),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .refine((c) => c.metric === 'count' || !!c.field, {
    message: 'field is required when metric is not count',
    path: ['field'],
  })
  .refine((c) => c.visualisation !== 'kpi' || c.step === 'all', {
    message: "KPI charts must use step 'all'",
    path: ['step'],
  })
  .refine((c) => c.visualisation === 'kpi' || c.step !== 'all', {
    message: "non-KPI charts cannot use step 'all'",
    path: ['step'],
  })

export type ChartDef = z.infer<typeof chartDefZ>
export type ChartDefInput = z.input<typeof chartDefZ>

/**
 * Group of charts on the dashboard. Groups are rendered as tabs above the
 * charts grid. When the user creates the very first group, all existing
 * (ungrouped) charts are auto-assigned to it.
 */
export const chartGroupZ = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(120),
  /** Sort key for the tab strip; lower numbers come first. */
  order: z.number().int().default(0),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type ChartGroup = z.infer<typeof chartGroupZ>
export type ChartGroupInput = z.input<typeof chartGroupZ>

export const dashboardBlobZ = z.object({
  version: z.literal(1),
  charts: z.array(chartDefZ),
  /** Optional — legacy blobs without `groups` parse cleanly via `.default([])`. */
  groups: z.array(chartGroupZ).default([]),
})
export type DashboardBlob = z.infer<typeof dashboardBlobZ>

export const EMPTY_DASHBOARD: DashboardBlob = {version: 1, charts: [], groups: []}

/**
 * Per-user dashboard storage port. Default implementation in
 * `@modern-admin/react` is browser-localStorage; a server-side store
 * implementing this same shape can be plugged in later without UI changes.
 */
export interface IDashboardStore {
  load(userId: string): Promise<DashboardBlob> | DashboardBlob

  save(userId: string, blob: DashboardBlob): Promise<void> | void
}
