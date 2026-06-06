// Phase 10: time-series-first chart builder.
//
// X-axis is ALWAYS a date — the user picks `dateField` (required). `groupBy`
// becomes an optional *secondary* breakdown that produces multiple series
// (Metabase-style: pick "status" → one line per status value). Pie removed.
// `width` lets the chart take half or full row on the dashboard grid.

import * as React from 'react'
import {
  BarChart2,
  LineChart,
  AreaChart,
  Activity,
} from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  InfoTooltip,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@modern-admin/ui'
import {
  chartDefZ,
  uuidv7,
  type AggregationOpName,
  type ChartDef,
  type ChartDefInput,
  type ChartVisualisation,
  type TimeRange,
  type TimeRangePreset,
} from '@modern-admin/core'
import { useI18n } from '../i18n.js'
import { useResources } from '../hooks.js'
import { ReferenceCombobox } from '../reference.js'
import type { PropertyJSON } from '../types.js'

export interface ChartBuilderDialogProps {
  /** Pre-populate for editing an existing chart. */
  initial?: ChartDef
  onSave(input: ChartDefInput): void
  onClose(): void
}

const VIS_OPTIONS: { value: ChartVisualisation; icon: React.ReactElement; labelKey: string }[] = [
  { value: 'kpi',  icon: <Activity   className="size-4" />, labelKey: 'dashboard:visKpi'  },
  { value: 'line', icon: <LineChart  className="size-4" />, labelKey: 'dashboard:visLine' },
  { value: 'area', icon: <AreaChart  className="size-4" />, labelKey: 'dashboard:visArea' },
  { value: 'bar',  icon: <BarChart2  className="size-4" />, labelKey: 'dashboard:visBar'  },
]

const NONE = '__none__'
const METRICS: AggregationOpName[] = ['count', 'sum', 'avg', 'min', 'max']
// `custom` is intentionally excluded from the builder — the builder sets a
// default interval; ad-hoc custom ranges are picked on the widget toolbar.
const PRESETS: Exclude<TimeRangePreset, 'custom'>[] = ['7d', '30d', '90d', '1y', 'all']

/** Date-ish heuristic for the dateField selector when adapter metadata is sparse. */
function isDateProperty(p: { type?: string; path: string }): boolean {
  if (p.type === 'date' || p.type === 'datetime') return true
  const lower = p.path.toLowerCase()
  return lower.endsWith('at') || lower.endsWith('_at') || lower.endsWith('date')
}

/**
 * Properties that make sense as a `groupBy` axis: anything that resolves to
 * a discrete column value the adapter can group on. Virtual relation columns
 * (`type: 'reference'` with `isArray: false` and no FK suffix) carry full
 * record objects in their values and would serialise to `[object Object]` —
 * exclude them so the user picks the underlying FK column instead.
 */
function isGroupable(p: { path: string; type?: string; isArray?: boolean }): boolean {
  if (isDateProperty(p)) return false
  if (p.type === 'reference' && !p.isArray) {
    // Allow scalar FK columns (named `*Id`/`*_id` with type 'reference' set
    // via adapter override) — they group cleanly to id strings. Reject virtual
    // relation fields whose values are objects.
    const path = p.path
    return path.endsWith('Id') || path.endsWith('_id')
  }
  if (p.type === 'json' || p.type === 'mixed') return false
  if (p.type === 'richtext' || p.type === 'markdown' || p.type === 'textarea') return false
  if (p.type === 'previewMedia' || p.type === 'file') return false
  return true
}

export function ChartBuilderDialog({
  initial,
  onSave,
  onClose,
}: ChartBuilderDialogProps): React.ReactElement {
  const { t } = useI18n()
  const resources = useResources()

  const [title, setTitle] = React.useState(initial?.title ?? '')
  const [visualisation, setVisualisation] = React.useState<ChartVisualisation>(
    initial?.visualisation ?? 'area',
  )
  const [resourceId, setResourceId] = React.useState(
    initial?.resource ?? resources[0]?.id ?? '',
  )
  const [dateField, setDateField] = React.useState(initial?.dateField ?? '')
  const [metric, setMetric] = React.useState<AggregationOpName>(initial?.metric ?? 'count')
  const [field, setField] = React.useState(initial?.field ?? '')
  const [groupBy, setGroupBy] = React.useState(initial?.groupBy ?? '')
  const [groupByLabelResource, setGroupByLabelResource] = React.useState(
    initial?.groupByLabelResource ?? '',
  )
  const [topN, setTopN] = React.useState(initial?.topN ?? 10)
  // The builder only sets a default time-range preset; custom ranges are
  // picked on the widget toolbar. If the saved chart is on 'custom', fall
  // back to the most useful preset for the builder UI.
  const [preset, setPreset] = React.useState<Exclude<TimeRangePreset, 'custom'>>(
    initial && initial.timeRange.preset !== 'custom' ? initial.timeRange.preset : '30d',
  )
  const [filters, setFilters] = React.useState<Record<string, string>>(
    initial?.filters ?? {},
  )
  const [quickFilters, setQuickFilters] = React.useState<string[]>(
    initial?.quickFilters ?? [],
  )
  const [order, setOrder] = React.useState<number>(initial?.order ?? 0)
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  const resource = resources.find((r) => r.id === resourceId)
  const properties = resource?.properties ?? []
  const dateProps = properties.filter(isDateProperty)
  const numericProps = properties.filter(
    (p) => p.type === 'number' || p.type === 'float' || p.type === 'currency',
  )

  // Auto-select dateField when resource changes (skip the very first
  // render of edit-mode so we keep the saved value).
  React.useEffect(() => {
    if (initial?.resource === resourceId) return
    setDateField(dateProps[0]?.path ?? '')
    setField('')
    setGroupBy('')
    setGroupByLabelResource('')
    setFilters({})
    setQuickFilters([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId])

  // When opening an existing chart that predates the groupByLabelResource
  // feature (groupByLabelResource is empty but groupBy is set): auto-derive
  // the label resource so the user gets resolved labels without re-saving.
  React.useEffect(() => {
    if (groupByLabelResource || !groupBy || properties.length === 0) return
    setGroupByLabelResource(resolveGroupByLabelResource(groupBy, properties))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupBy, properties])

  const isKpi = visualisation === 'kpi'

  const buildTimeRange = (): TimeRange => ({ preset })

  const handleFilterChange = (path: string, value: string): void => {
    setFilters((prev) => {
      const next = { ...prev }
      if (value === '') delete next[path]
      else next[path] = value
      return next
    })
  }

  const toggleQuickFilter = (path: string): void => {
    setQuickFilters((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path],
    )
  }

  const handleSave = (): void => {
    const now = new Date().toISOString()
    // step is not user-editable in the builder; keep the previous value (or
    // pick a sane default) so chartDefZ stays valid. The widget toolbar
    // remains the place to tweak step on the fly.
    const savedStep = isKpi
      ? 'all'
      : initial && initial.step !== 'all'
        ? initial.step
        : 'day'
    const candidate: ChartDefInput = {
      id: initial?.id ?? uuidv7(),
      title: title.trim() || resource?.name || resourceId,
      resource: resourceId,
      visualisation,
      dateField,
      step: savedStep,
      metric,
      width: initial?.width ?? 'half',
      topN,
      filters,
      quickFilters: quickFilters.filter((p) => properties.some((q) => q.path === p)),
      timeRange: buildTimeRange(),
      order,
      // Preserve groupId on edit — the builder does not (yet) change group
      // membership directly; groups are managed from the dashboard tab strip.
      ...(initial?.groupId ? { groupId: initial.groupId } : {}),
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
      ...(metric !== 'count' && field ? { field } : {}),
      ...(!isKpi && groupBy ? { groupBy } : {}),
      ...(!isKpi && groupBy && groupByLabelResource ? { groupByLabelResource } : {}),
    }
    const result = chartDefZ.safeParse(candidate)
    if (!result.success) {
      const fieldErrs: Record<string, string> = {}
      for (const issue of result.error.issues) {
        const key = issue.path[0]
        if (typeof key === 'string' && !fieldErrs[key]) fieldErrs[key] = issue.message
      }
      setErrors(fieldErrs)
      return
    }
    setErrors({})
    onSave(candidate)
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {initial ? t('chart:editChart') : t('chart:newChart')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Title + order */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_8rem]">
            <div className="space-y-1.5">
              <Label htmlFor="chart-title">{t('chart:title')}</Label>
              <Input
                id="chart-title"
                placeholder={t('chart:titlePlaceholder')}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="chart-order">{t('chart:order')}</Label>
                <InfoTooltip content={t('chart:orderHint')} />
              </div>
              <Input
                id="chart-order"
                type="number"
                step={1}
                value={order}
                onChange={(e) => setOrder(Number.isFinite(Number(e.target.value)) ? Math.trunc(Number(e.target.value)) : 0)}
              />
            </div>
          </div>

          {/* Visualisation (incl. KPI) */}
          <div className="space-y-1.5">
            <Label>{t('dashboard:vis')}</Label>
            <div className="flex flex-wrap gap-2">
              {VIS_OPTIONS.map(({ value, icon, labelKey }) => (
                <Button
                  key={value}
                  type="button"
                  variant={visualisation === value ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1 min-w-[5rem] gap-1.5 capitalize"
                  onClick={() => setVisualisation(value)}
                >
                  {icon}
                  <span className="hidden sm:inline">{t(labelKey)}</span>
                </Button>
              ))}
            </div>
          </div>

          {/* Resource */}
          <div className="space-y-1.5">
            <Label htmlFor="chart-resource">{t('chart:resource')}</Label>
            <Select value={resourceId} onValueChange={(v) => setResourceId(v)}>
              <SelectTrigger id="chart-resource">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {resources.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                    {r.name !== r.id && (
                      <span className="ml-1.5 text-xs text-muted-foreground">({r.id})</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.resource && (
              <p className="text-xs text-destructive">{errors.resource}</p>
            )}
          </div>

          {/* Date field — required, drives the X-axis bucketing */}
          <div className="space-y-1.5">
            <Label htmlFor="chart-datefield">{t('dashboard:builder.dateField')}</Label>
            <Select
              value={dateField || NONE}
              onValueChange={(v) => setDateField(v === NONE ? '' : v)}
            >
              <SelectTrigger id="chart-datefield">
                <SelectValue placeholder={t('chart:selectField')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t('chart:selectField')}</SelectItem>
                {(dateProps.length > 0 ? dateProps : properties).map((p) => (
                  <SelectItem key={p.path} value={p.path}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t('dashboard:builder.dateFieldHint')}
            </p>
            {errors.dateField && (
              <p className="text-xs text-destructive">{errors.dateField}</p>
            )}
          </div>

          {/* Metric + field */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="chart-metric">{t('chart:metric')}</Label>
              <Select value={metric} onValueChange={(v) => setMetric(v as AggregationOpName)}>
                <SelectTrigger id="chart-metric">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METRICS.map((m) => (
                    <SelectItem key={m} value={m}>{t(`dashboard:metric${cap(m)}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {metric !== 'count' && (
              <div className="space-y-1.5">
                <Label htmlFor="chart-field">{t('chart:aggregateField')}</Label>
                <Select
                  value={field || NONE}
                  onValueChange={(v) => setField(v === NONE ? '' : v)}
                >
                  <SelectTrigger id="chart-field">
                    <SelectValue placeholder={t('chart:selectField')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t('chart:selectField')}</SelectItem>
                    {numericProps.map((p) => (
                      <SelectItem key={p.path} value={p.path}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.field && (
                  <p className="text-xs text-destructive">{errors.field}</p>
                )}
              </div>
            )}
          </div>

          {/* Secondary groupBy + topN — non-KPI only */}
          {!isKpi && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="chart-groupby">
                  {t('dashboard:builder.secondaryGroupBy')}
                </Label>
                <Select
                  value={groupBy || NONE}
                  onValueChange={(v) => {
                    const path = v === NONE ? '' : v
                    setGroupBy(path)
                    setGroupByLabelResource(resolveGroupByLabelResource(path, properties))
                  }}
                >
                  <SelectTrigger id="chart-groupby">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t('dashboard:builder.noBreakdown')}</SelectItem>
                    {properties
                      .filter((p) => isGroupable(p) && p.path !== dateField)
                      .map((p) => (
                        <SelectItem key={p.path} value={p.path}>{p.label}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {groupBy && (
                <div className="space-y-1.5">
                  <Label htmlFor="chart-topn">{t('dashboard:builder.topN')}</Label>
                  <Input
                    id="chart-topn"
                    type="number"
                    min={1}
                    max={50}
                    value={topN}
                    onChange={(e) =>
                      setTopN(Math.max(1, Math.min(50, Number(e.target.value) || 10)))
                    }
                  />
                </div>
              )}
            </div>
          )}

          {/* Default time-range preset. Custom ranges are picked on the
              widget toolbar — not in the builder. */}
          <div className="space-y-1.5">
            <Label>{t('dashboard:builder.range')}</Label>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <Button
                  key={p}
                  type="button"
                  variant={preset === p ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1 min-w-[4rem]"
                  onClick={() => setPreset(p)}
                >
                  {t(`dashboard:range.${p}`)}
                </Button>
              ))}
            </div>
          </div>

          {/* Filters — one row per property, with a checkbox to mark the
              filter as a "quick filter" (exposed above the chart for inline
              tweaking on the dashboard). Reference fields use a combobox. */}
          {properties.length > 0 && (
            <div className="space-y-1.5">
              <Label>{t('dashboard:builder.filters')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('dashboard:builder.filtersHint')}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                {properties.filter(isFilterable).map((p) => {
                  const exposed = quickFilters.includes(p.path)
                  return (
                    <div key={p.path} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <Label
                          htmlFor={`flt-${p.path}`}
                          className="text-xs text-muted-foreground"
                        >
                          {p.label}
                        </Label>
                        <Switch
                          checked={exposed}
                          onCheckedChange={() => toggleQuickFilter(p.path)}
                          aria-label={t('dashboard:builder.quickFilterToggle').replace(
                            '{field}',
                            p.label,
                          )}
                          title={t('dashboard:builder.quickFilterHint')}
                        />
                      </div>
                      <FilterInput
                        property={p}
                        value={filters[p.path] ?? ''}
                        onChange={(v) => handleFilterChange(p.path, v)}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common:cancel')}</Button>
          <Button onClick={handleSave} disabled={!resourceId || !dateField}>
            {t('chart:saveChart')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * Property is exposable as a filter. Excludes ids, array fields, free-form
 * blobs (json/mixed/richtext), media fields, and virtual relation columns
 * (we keep the underlying FK column so we don't list `authorId` and `author`
 * twice).
 */
function isFilterable(p: PropertyJSON): boolean {
  if (p.isId) return false
  if (p.isArray) return false
  if (p.type === 'json' || p.type === 'mixed') return false
  if (p.type === 'richtext' || p.type === 'markdown' || p.type === 'textarea') return false
  if (p.type === 'previewMedia' || p.type === 'file') return false
  // Drop virtual relation columns (full objects) — keep FK siblings instead.
  if (p.type === 'reference' && !p.isArray) {
    const path = p.path
    if (!(path.endsWith('Id') || path.endsWith('_id'))) return false
  }
  return true
}

/**
 * Renders an inline input for one filter row in the builder. Reference
 * properties get the same combobox the resource forms use; enums/booleans
 * get a Select; numerics get a number input; everything else falls back to
 * a plain text input.
 */
function FilterInput({
  property,
  value,
  onChange,
}: {
  property: PropertyJSON
  value: string
  onChange(next: string): void
}): React.ReactElement {
  if (property.reference) {
    return (
      <ReferenceCombobox
        referenceResourceId={property.reference}
        value={value || null}
        onChange={(next) => onChange(next == null ? '' : String(next))}
      />
    )
  }
  if (property.availableValues && property.availableValues.length > 0) {
    return (
      <Select
        value={value || NONE}
        onValueChange={(v) => onChange(v === NONE ? '' : v)}
      >
        <SelectTrigger id={`flt-${property.path}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>—</SelectItem>
          {property.availableValues.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }
  if (property.type === 'boolean') {
    return (
      <Select
        value={value || NONE}
        onValueChange={(v) => onChange(v === NONE ? '' : v)}
      >
        <SelectTrigger id={`flt-${property.path}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>—</SelectItem>
          <SelectItem value="true">true</SelectItem>
          <SelectItem value="false">false</SelectItem>
        </SelectContent>
      </Select>
    )
  }
  const isNumeric =
    property.type === 'number' || property.type === 'float' || property.type === 'currency'
  return (
    <Input
      id={`flt-${property.path}`}
      type={isNumeric ? 'number' : 'text'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

/**
 * Resolve which resource to use for groupBy label resolution.
 *
 * 1. If the property itself is `type: 'reference'` (virtual relation field),
 *    use its `reference` resource id directly — same mechanism as the record
 *    title display in resource forms.
 * 2. If it is a raw FK column (e.g. `authorId`), look for a sibling property
 *    whose path is the FK name without the trailing `Id`/`_id` suffix AND
 *    has `reference` set. Covers the Prisma/Drizzle naming convention.
 */
function resolveGroupByLabelResource(
  path: string,
  properties: ReadonlyArray<{ path: string; type: string; reference: string | null }>,
): string {
  if (!path) return ''
  const prop = properties.find((p) => p.path === path)
  if (!prop) return ''
  // Direct reference property (virtual relation).
  if (prop.reference) return prop.reference
  // FK column heuristic: strip Id / _id suffix and look for sibling.
  const base = prop.path.endsWith('_id')
    ? prop.path.slice(0, -3)
    : prop.path.endsWith('Id')
      ? prop.path.slice(0, -2)
      : ''
  if (base) {
    const sibling = properties.find((p) => p.path === base && p.reference)
    if (sibling?.reference) return sibling.reference
  }
  return ''
}
