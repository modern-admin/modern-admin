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
  Plus,
  X,
} from 'lucide-react'
import {
  Button,
  CHART_COLOR_PRESETS,
  ColorSwatchPicker,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@modern-admin/ui'
import {
  chartDefZ,
  uuidv7,
  type AggregationOpName,
  type ChartDef,
  type ChartDefInput,
  type ChartFormat,
  type ChartTransformStep,
  type ChartVisualisation,
  type TimeRange,
  type TimeRangePreset,
} from '@modern-admin/core'
import { applyTransform, makeValueFormatter } from '../dashboard/value-format.js'
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
const TRANSFORM_OPS: ChartTransformStep['op'][] = ['divide', 'multiply', 'add', 'subtract']
const FORMAT_STYLES: NonNullable<ChartFormat['style']>[] = ['number', 'currency', 'percent']
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
  const { t, locale } = useI18n()
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
  const [comparePrevious, setComparePrevious] = React.useState(
    initial?.comparePrevious ?? false,
  )
  const [transform, setTransform] = React.useState<ChartTransformStep[]>(
    () => initial?.transform?.map((s) => ({ ...s })) ?? [],
  )
  const [formatStyle, setFormatStyle] = React.useState<NonNullable<ChartFormat['style']>>(
    initial?.format?.style ?? 'number',
  )
  const [currency, setCurrency] = React.useState(initial?.format?.currency ?? '')
  const [decimals, setDecimals] = React.useState<string>(
    initial?.format?.decimals != null ? String(initial.format.decimals) : '',
  )
  const [compact, setCompact] = React.useState(initial?.format?.compact ?? false)
  const [prefix, setPrefix] = React.useState(initial?.format?.prefix ?? '')
  const [suffix, setSuffix] = React.useState(initial?.format?.suffix ?? '')
  const [totalColor, setTotalColor] = React.useState<string | undefined>(
    initial?.series?.['__total__']?.color,
  )
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [tab, setTab] = React.useState<'data' | 'display' | 'filters'>('data')

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

  // Omit `format` entirely while everything is at its default so old charts
  // don't accumulate noise on re-save.
  const buildFormat = (): ChartFormat | undefined => {
    const dec = decimals === '' ? undefined : Math.max(0, Math.min(6, Math.trunc(Number(decimals))))
    const fmt = {
      style: formatStyle,
      ...(formatStyle === 'currency' && currency.trim().length === 3
        ? { currency: currency.trim().toUpperCase() }
        : {}),
      ...(dec != null && Number.isFinite(dec) ? { decimals: dec } : {}),
      ...(prefix ? { prefix: prefix.slice(0, 8) } : {}),
      ...(suffix ? { suffix: suffix.slice(0, 8) } : {}),
      ...(compact ? { compact: true } : {}),
    }
    const isDefault = fmt.style === 'number' && Object.keys(fmt).length === 1
    return isDefault ? undefined : fmt
  }

  // Preserve per-series overrides saved from the widget colors dialog; the
  // builder itself only edits the single-series (__total__) color.
  const buildSeries = (): Record<string, { color?: string }> | undefined => {
    const next: Record<string, { color?: string }> = { ...initial?.series }
    if (!isKpi && !groupBy) {
      if (totalColor) next.__total__ = { color: totalColor }
      else delete next.__total__
    }
    return Object.keys(next).length ? next : undefined
  }

  // Live preview for the transform/format sections — pure helpers, cheap.
  const previewFormat = React.useMemo(
    () => makeValueFormatter(buildFormat(), locale),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [formatStyle, currency, decimals, compact, prefix, suffix, locale],
  )
  const PREVIEW_SAMPLE = 1234
  const previewText = `${PREVIEW_SAMPLE} → ${previewFormat(applyTransform(PREVIEW_SAMPLE, transform))}`

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
      transform,
      // Compare is only meaningful for time-series without a breakdown.
      comparePrevious: !isKpi && !groupBy ? comparePrevious : false,
      ...(buildFormat() ? { format: buildFormat() } : {}),
      ...(buildSeries() ? { series: buildSeries() } : {}),
    }
    const result = chartDefZ.safeParse(candidate)
    if (!result.success) {
      const fieldErrs: Record<string, string> = {}
      for (const issue of result.error.issues) {
        const key = issue.path[0]
        if (typeof key === 'string' && !fieldErrs[key]) fieldErrs[key] = issue.message
      }
      setErrors(fieldErrs)
      // Every schema-validated field lives on the Data tab — surface it so
      // the inline error isn't hidden behind another tab.
      setTab('data')
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

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as 'data' | 'display' | 'filters')}
          className="py-1"
        >
          <TabsList>
            <TabsTrigger value="data">{t('dashboard:builder.tabData')}</TabsTrigger>
            <TabsTrigger value="display">{t('dashboard:builder.tabDisplay')}</TabsTrigger>
            <TabsTrigger value="filters">{t('dashboard:builder.tabFilters')}</TabsTrigger>
          </TabsList>

          <TabsContent value="data" className="space-y-4">
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
          </TabsContent>

          <TabsContent value="display" className="space-y-4">
          {/* Previous-period compare — time-series without breakdown only. */}
          {!isKpi && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="chart-compare">
                    {t('dashboard:builder.comparePrevious')}
                  </Label>
                  <InfoTooltip content={t('dashboard:builder.comparePreviousHint')} />
                </div>
                <Switch
                  id="chart-compare"
                  checked={!groupBy && comparePrevious}
                  disabled={!!groupBy}
                  onCheckedChange={setComparePrevious}
                  aria-label={t('dashboard:builder.comparePrevious')}
                />
              </div>
              {!!groupBy && (
                <p className="text-xs text-muted-foreground">
                  {t('dashboard:builder.comparePreviousDisabled')}
                </p>
              )}
            </div>
          )}

          {/* Value transform — ordered scalar pipeline (e.g. cents → dollars). */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label>{t('dashboard:builder.transform')}</Label>
              <InfoTooltip content={t('dashboard:builder.transformHint')} />
            </div>
            {transform.map((step, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select
                  value={step.op}
                  onValueChange={(v) =>
                    setTransform((prev) =>
                      prev.map((s, j) =>
                        j === i ? { ...s, op: v as ChartTransformStep['op'] } : s,
                      ),
                    )
                  }
                >
                  <SelectTrigger className="w-40" aria-label={t('dashboard:builder.transform')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRANSFORM_OPS.map((op) => (
                      <SelectItem key={op} value={op}>
                        {t(`dashboard:builder.op${cap(op)}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  className="w-28"
                  value={Number.isFinite(step.value) ? step.value : ''}
                  onChange={(e) =>
                    setTransform((prev) =>
                      prev.map((s, j) =>
                        j === i ? { ...s, value: Number(e.target.value) } : s,
                      ),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() =>
                    setTransform((prev) => prev.filter((_, j) => j !== i))
                  }
                  aria-label={t('dashboard:builder.transformRemove')}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
            {transform.length < 8 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setTransform((prev) => [...prev, { op: 'divide', value: 100 }])
                }
              >
                <Plus className="size-4 mr-1" />
                {t('dashboard:builder.transformAdd')}
              </Button>
            )}
          </div>

          {/* Value format */}
          <div className="space-y-1.5">
            <Label>{t('dashboard:builder.format')}</Label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label
                  htmlFor="chart-format-style"
                  className="text-xs text-muted-foreground"
                >
                  {t('dashboard:builder.formatStyle')}
                </Label>
                <Select
                  value={formatStyle}
                  onValueChange={(v) => setFormatStyle(v as NonNullable<ChartFormat['style']>)}
                >
                  <SelectTrigger id="chart-format-style">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FORMAT_STYLES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(`dashboard:builder.format${cap(s)}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {formatStyle === 'currency' && (
                <div className="space-y-1">
                  <Label
                    htmlFor="chart-format-currency"
                    className="text-xs text-muted-foreground"
                  >
                    {t('dashboard:builder.formatCurrencyCode')}
                  </Label>
                  <Input
                    id="chart-format-currency"
                    placeholder="USD"
                    maxLength={3}
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  />
                </div>
              )}
              <div className="space-y-1">
                <Label
                  htmlFor="chart-format-decimals"
                  className="text-xs text-muted-foreground"
                >
                  {t('dashboard:builder.formatDecimals')}
                </Label>
                <Input
                  id="chart-format-decimals"
                  type="number"
                  min={0}
                  max={6}
                  value={decimals}
                  onChange={(e) => setDecimals(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label
                  htmlFor="chart-format-prefix"
                  className="text-xs text-muted-foreground"
                >
                  {t('dashboard:builder.formatPrefix')} / {t('dashboard:builder.formatSuffix')}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="chart-format-prefix"
                    maxLength={8}
                    placeholder={t('dashboard:builder.formatPrefix')}
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value)}
                  />
                  <Input
                    maxLength={8}
                    placeholder={t('dashboard:builder.formatSuffix')}
                    value={suffix}
                    onChange={(e) => setSuffix(e.target.value)}
                    aria-label={t('dashboard:builder.formatSuffix')}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 sm:col-span-2">
                <Label htmlFor="chart-format-compact">
                  {t('dashboard:builder.formatCompact')}
                </Label>
                <Switch
                  id="chart-format-compact"
                  checked={compact}
                  onCheckedChange={setCompact}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">{previewText}</p>
          </div>

          {/* Series color — single-series charts; breakdown colors are edited
              from the widget menu once the series are known. */}
          {!isKpi && !groupBy && (
            <div className="space-y-1.5">
              <Label>{t('dashboard:builder.color')}</Label>
              <ColorSwatchPicker
                value={totalColor}
                onChange={setTotalColor}
                presets={CHART_COLOR_PRESETS}
                labels={{
                  custom: t('dashboard:widget.colorCustom'),
                  pick: t('dashboard:widget.colorPick'),
                  auto: t('dashboard:widget.colorAuto'),
                }}
              />
            </div>
          )}
          </TabsContent>

          <TabsContent value="filters" className="space-y-4">
          {/* Filters — one row per property, with a checkbox to mark the
              filter as a "quick filter" (exposed above the chart for inline
              tweaking on the dashboard). Reference fields use a combobox. */}
          {properties.length > 0 ? (
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
          ) : (
            <p className="text-sm text-muted-foreground">
              {t('dashboard:builder.filtersEmpty')}
            </p>
          )}
          </TabsContent>
        </Tabs>

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
