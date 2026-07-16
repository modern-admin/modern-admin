// Dashboard tile rendering one ChartDef. Phase 10 brings:
//  • Per-widget toolbar (step / range / width / SQL toggle) — changes persist
//    via `onUpdate` so a tweak survives reload without re-opening the builder.
//  • Time-series chart (date X-axis, value Y-axis) with multi-series via
//    secondary `groupBy`. Zero-fill happens UI-side regardless of adapter.
//  • KPI mode = `step: 'all'` — sums the single bucket and shows period-over-
//    period delta.
//  • Graceful degradation when the adapter cannot do time-series aggregation
//    (e.g. non-relational DB) — shows a friendly message instead of erroring.

import * as React from 'react'
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  RefreshCw,
  Maximize2,
  Minimize2,
  Code,
  Copy,
  Check,
  FolderSymlink,
  AlertTriangle,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  TimeSeriesChart,
  KpiCard,
  DatePicker,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@modern-admin/ui'
import { ReferenceCombobox } from '../reference.js'
import type { PropertyJSON } from '../types.js'
import type {
  ChartDef,
  ChartDefInput,
  AggregationStep,
  ChartWidth,
  TimeRange,
  TimeRangePreset,
} from '@modern-admin/core'
import { useTimeSeries, useResource } from '../hooks.js'
import { useI18n } from '../i18n.js'
import { resolveRange } from '../use-dashboard-charts.js'
import {
  fillTimeSeries,
  makeLabelFormatter,
  makeTickFormatter,
} from '../dashboard/time-series.js'
import type { TimeSeriesQuery, TimeSeriesSeries } from '../client.js'

const PRESETS: TimeRangePreset[] = ['7d', '30d', '90d', '1y', 'all', 'custom']
const STEPS: Exclude<AggregationStep, 'all'>[] = ['day', 'week', 'month', 'year']

export interface ChartWidgetProps {
  config: ChartDef
  onEdit(): void
  onDelete(): void
  onMove?(): void
  /** Called when the user tweaks step / range / width directly on the widget. */
  onUpdate(input: ChartDefInput): void
}

export function ChartWidget({
  config,
  onEdit,
  onDelete,
  onMove,
  onUpdate,
}: ChartWidgetProps): React.ReactElement {
  const { t, locale } = useI18n()

  const isKpi = config.visualisation === 'kpi'
  // KPI charts force `step: 'all'`; the schema enforces this at save time.
  // For very wide presets, automatically coarsen granularity so the point
  // count stays manageable — 3650 daily buckets for 'all' would render an
  // unreadable axis and cause significant memory pressure in Recharts.
  const renderStep: AggregationStep =
    isKpi ? 'all'
      : config.timeRange.preset === 'all' && (config.step === 'day' || config.step === 'week') ? 'month'
        : config.timeRange.preset === '1y' && config.step === 'day' ? 'week'
          : config.step

  // Resolve the time-range preset to concrete from/to per render so cards
  // automatically reflect "now" as days roll over without re-saving.
  const range = React.useMemo(() => resolveRange(config.timeRange), [config.timeRange])

  // If the saved ChartDef pre-dates the groupByLabelResource feature (i.e.,
  // groupBy is set but groupByLabelResource is not), derive it from the
  // resource's property metadata so labels resolve without requiring a re-save.
  const resourceConfig = useResource(config.resource)
  const effectiveLabelResource = React.useMemo(() => {
    if (config.groupByLabelResource) return config.groupByLabelResource
    if (!config.groupBy || !resourceConfig) return undefined
    const props = resourceConfig.properties
    const prop = props.find((p) => p.path === config.groupBy)
    if (!prop) return undefined
    if (prop.reference) return prop.reference
    // FK heuristic: strip Id / _id suffix and look for a sibling reference prop.
    const base = prop.path.endsWith('_id')
      ? prop.path.slice(0, -3)
      : prop.path.endsWith('Id')
        ? prop.path.slice(0, -2)
        : ''
    if (base) {
      const sibling = props.find((p) => p.path === base && p.reference)
      if (sibling?.reference) return sibling.reference
    }
    return undefined
  }, [config.groupBy, config.groupByLabelResource, resourceConfig])

  const query = React.useMemo<TimeSeriesQuery>(
    () => ({
      resource: config.resource,
      dateField: config.dateField,
      step: renderStep as TimeSeriesQuery['step'],
      metric: config.metric,
      from: range.from,
      to: range.to,
      ...(config.field ? { field: config.field } : {}),
      ...(!isKpi && config.groupBy ? { groupBy: config.groupBy } : {}),
      ...(!isKpi && config.groupBy ? { topN: config.topN } : {}),
      ...(!isKpi && config.groupBy && effectiveLabelResource
        ? { groupByLabelResource: effectiveLabelResource }
        : {}),
      ...(Object.keys(config.filters).length ? { filters: config.filters } : {}),
      ...(isKpi ? { comparePrevious: true as const } : {}),
    }),
    [config, range, isKpi, renderStep, effectiveLabelResource],
  )

  const { data, isLoading, isError, refetch, isFetching } = useTimeSeries(query)

  const [showSql, setShowSql] = React.useState(false)
  const [sqlCopied, setSqlCopied] = React.useState(false)

  // Draft from/to — only committed when the user clicks Apply.
  // Seeded from `config.timeRange` when preset changes to 'custom'.
  const [draftFrom, setDraftFrom] = React.useState(range.from)
  const [draftTo, setDraftTo] = React.useState(range.to)

  // Draft state for quick filters exposed above the chart. The user tweaks
  // values inline and clicks Apply to refetch — mirroring the custom-range
  // pattern so widgets don't refetch on every keystroke.
  const quickFilterPaths = config.quickFilters ?? []
  const [draftFilters, setDraftFilters] = React.useState<Record<string, string>>(
    () => seedDraftFilters(quickFilterPaths, config.filters),
  )
  // Re-seed whenever the saved chart definition changes externally.
  const quickFiltersKey = quickFilterPaths.join('|')
  const savedFiltersKey = React.useMemo(
    () =>
      Object.entries(config.filters)
        .map(([k, v]) => `${k}=${v}`)
        .sort()
        .join('|'),
    [config.filters],
  )
  React.useEffect(() => {
    setDraftFilters(seedDraftFilters(quickFilterPaths, config.filters))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickFiltersKey, savedFiltersKey])

  const applyQuickFilters = (): void => {
    const next: Record<string, string> = { ...config.filters }
    for (const p of quickFilterPaths) {
      const v = draftFilters[p] ?? ''
      if (v === '') delete next[p]
      else next[p] = v
    }
    update({ filters: next })
  }

  const draftDirty = quickFilterPaths.some(
    (p) => (draftFilters[p] ?? '') !== (config.filters[p] ?? ''),
  )

  // Mutators — persisted by the parent via `onUpdate(updatedDef)`.
  const update = (patch: Partial<ChartDefInput>): void => {
    onUpdate({ ...config, ...patch, updatedAt: new Date().toISOString() })
  }

  const onPresetChange = (preset: TimeRangePreset): void => {
    if (preset === 'custom') {
      // Seed draft with the currently resolved window — user can then narrow
      // it and click Apply without triggering an immediate refetch.
      setDraftFrom(range.from)
      setDraftTo(range.to)
      update({
        timeRange: { preset: 'custom', from: range.from, to: range.to } as TimeRange,
      })
    } else {
      update({ timeRange: { preset } as TimeRange })
    }
  }

  const applyCustomRange = (): void => {
    if (draftFrom && draftTo) {
      update({
        timeRange: { preset: 'custom', from: draftFrom, to: draftTo } as TimeRange,
      })
    }
  }

  const onStepChange = (step: AggregationStep): void => {
    if (step === 'all') return // KPI is selected via the builder, not the toolbar
    update({ step })
  }

  const onWidthToggle = (): void => {
    update({ width: (config.width === 'full' ? 'half' : 'full') as ChartWidth })
  }

  // ── Render ────────────────────────────────────────────────────────────

  const heightClass = isKpi ? 'h-32' : 'h-[320px]'

  const resolvedLabels = data?.resolvedLabels
  const seriesLabel = React.useCallback(
    (key: string): string => {
      if (key === '__total__') return t('dashboard:seriesTotal')
      if (key === '__other__') return t('dashboard:seriesOther')
      if (key === '__null__') return t('dashboard:seriesNull')
      return resolvedLabels?.[key] ?? key
    },
    [resolvedLabels, t],
  )

  const chartSeries = React.useMemo(
    () => prepareSeries(data?.series ?? [], range, renderStep, seriesLabel),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data?.series, range.from, range.to, renderStep, seriesLabel],
  )

  // Adapter cannot do time-series — friendly message, no toolbar churn.
  const unsupported = data && data.supported === false

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between gap-2 p-3 pb-2 space-y-0 sm:p-6 sm:pb-2">
        <CardTitle className="text-sm font-medium truncate pr-2">
          {config.title || t('chart:untitled')}
        </CardTitle>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={onWidthToggle}
            aria-label={
              config.width === 'full'
                ? t('dashboard:widget.shrink')
                : t('dashboard:widget.expand')
            }
          >
            {config.width === 'full' ? (
              <Minimize2 className="size-3.5" />
            ) : (
              <Maximize2 className="size-3.5" />
            )}
          </Button>
          {data?.sql && (
            <Button
              variant={showSql ? 'secondary' : 'ghost'}
              size="icon"
              className="size-7"
              onClick={() => setShowSql((v) => !v)}
              aria-label={t('dashboard:widget.toggleSql')}
            >
              <Code className="size-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label={t('common:refresh')}
          >
            <RefreshCw className={`size-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={t('common:openMenu')}
              >
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="size-4 mr-2" />
                {t('chart:editChart')}
              </DropdownMenuItem>
              {onMove && (
                <DropdownMenuItem onClick={onMove}>
                  <FolderSymlink className="size-4 mr-2" />
                  {t('chart:moveToGroup')}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="size-4 mr-2" />
                {t('chart:deleteChart')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="flex-1 p-3 pt-0 space-y-3 sm:p-6 sm:pt-0">
        {/* Quick filters — compact inline row, label as placeholder, Apply on the right. */}
        {!unsupported && quickFilterPaths.length > 0 && resourceConfig && (
          <div className="flex flex-wrap items-center gap-2">
            {quickFilterPaths.map((path) => {
              const prop = resourceConfig.properties.find((p) => p.path === path)
              if (!prop) return null
              return (
                <QuickFilterInput
                  key={path}
                  property={prop}
                  placeholder={prop.label}
                  value={draftFilters[path] ?? ''}
                  onChange={(v) => setDraftFilters((prev) => ({ ...prev, [path]: v }))}
                />
              )
            })}
            <Button
              size="sm"
              className="h-8 px-3 text-xs shrink-0"
              onClick={applyQuickFilters}
              disabled={!draftDirty}
            >
              <Check className="size-3.5 mr-1" />
              {t('common:apply')}
            </Button>
          </div>
        )}

        {/* Toolbar — step + range + window display. Hidden for unsupported
            adapters because changing knobs would have no effect. */}
        {!unsupported && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {!isKpi && (
              <Select
                value={config.step === 'all' ? 'day' : config.step}
                onValueChange={(v) => onStepChange(v as AggregationStep)}
              >
                <SelectTrigger
                  className="h-8 px-2 text-xs w-auto"
                  aria-label={t('chart:step')}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STEPS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`chart:step${cap(s)}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select
              value={config.timeRange.preset}
              onValueChange={(v) => onPresetChange(v as TimeRangePreset)}
            >
              <SelectTrigger
                className="h-8 px-2 text-xs w-auto"
                aria-label={t('dashboard:builder.range')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRESETS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {t(`dashboard:range.${p}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {config.timeRange.preset === 'custom' ? (
              <>
                <DatePicker
                  value={draftFrom}
                  onChange={setDraftFrom}
                  ariaLabel={t('common:from')}
                  openCalendarLabel={t('common:openCalendar')}
                  className="w-[130px]"
                  inputClassName="h-8 text-xs"
                />
                <span className="text-muted-foreground">—</span>
                <DatePicker
                  value={draftTo}
                  onChange={setDraftTo}
                  ariaLabel={t('common:to')}
                  openCalendarLabel={t('common:openCalendar')}
                  className="w-[130px]"
                  inputClassName="h-8 text-xs"
                />
                <Button
                  size="sm"
                  className="h-8 px-3 shrink-0"
                  onClick={applyCustomRange}
                  disabled={!draftFrom || !draftTo}
                  aria-label={t('common:apply')}
                >
                  <Check className="size-3.5 mr-1" />
                  {t('common:apply')}
                </Button>
              </>
            ) : (
              <span className="ml-auto tabular-nums">
                {range.from} — {range.to}
              </span>
            )}
          </div>
        )}

        {/* Truncation warning — adapter capped the scan, so the chart reflects
            only a subset of the window. Hidden while loading / unsupported. */}
        {!unsupported && !isError && data?.truncated && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
            <span>{t('dashboard:widget.truncatedWarning')}</span>
          </div>
        )}

        {/* Body */}
        {isLoading ? (
          <Skeleton className={`${heightClass} w-full rounded-md`} />
        ) : isError ? (
          <div
            className={`flex items-center justify-center text-sm text-muted-foreground ${heightClass}`}
          >
            {t('chart:loadError')}
          </div>
        ) : unsupported ? (
          <div
            className={`flex items-center justify-center text-center text-sm text-muted-foreground px-4 ${heightClass}`}
          >
            {t('dashboard:widget.unsupported')}
          </div>
        ) : isKpi ? (
          <KpiBody data={data} labels={kpiLabels(t)} />
        ) : (
          <TimeSeriesChart
            series={chartSeries}
            height={320}
            visualisation={config.visualisation === 'kpi' ? undefined : config.visualisation}
            tickFormatter={makeTickFormatter(renderStep, locale)}
            labelFormatter={makeLabelFormatter(renderStep, locale)}
            labels={{
              noData: t('chart:noData'),
              showAll: t('dashboard:widget.showAll'),
              hideAll: t('dashboard:widget.hideAll'),
            }}
          />
        )}

        {/* Captured SQL — only when the user toggled and server returned it. */}
        {data?.sql && showSql && (
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-1 right-1 size-6"
              onClick={() => {
                void navigator.clipboard.writeText(data.sql ?? '')
                setSqlCopied(true)
                setTimeout(() => setSqlCopied(false), 2000)
              }}
              aria-label={sqlCopied ? t('common:copied') : t('common:copy')}
            >
              {sqlCopied
                ? <Check className="size-3 text-green-500" />
                : <Copy className="size-3" />}
            </Button>
            <pre className="text-[11px] leading-snug bg-muted/50 border border-border rounded-md p-2 pr-8 overflow-x-auto whitespace-pre">
              {data.sql}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

const QF_NONE = '__none__'

function seedDraftFilters(
  paths: ReadonlyArray<string>,
  filters: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of paths) out[p] = filters[p] ?? ''
  return out
}

/** Compact inline filter input — label is passed as placeholder so no
 *  extra row is needed. Matches the `h-7 text-xs` sizing of toolbar controls. */
function QuickFilterInput({
  property,
  placeholder,
  value,
  onChange,
}: {
  property: PropertyJSON
  placeholder?: string
  value: string
  onChange(next: string): void
}): React.ReactElement {
  const ph = placeholder ?? property.label
  if (property.reference) {
    return (
      <div className="w-36">
        <ReferenceCombobox
          referenceResourceId={property.reference}
          value={value || null}
          onChange={(next) => onChange(next == null ? '' : String(next))}
          placeholder={ph}
          className="h-8 text-xs"
        />
      </div>
    )
  }
  if (property.availableValues && property.availableValues.length > 0) {
    return (
      <Select
        value={value || QF_NONE}
        onValueChange={(v) => onChange(v === QF_NONE ? '' : v)}
      >
        <SelectTrigger className="h-8 px-2 text-xs w-36">
          <SelectValue placeholder={ph} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={QF_NONE}>{ph}</SelectItem>
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
        value={value || QF_NONE}
        onValueChange={(v) => onChange(v === QF_NONE ? '' : v)}
      >
        <SelectTrigger className="h-8 px-2 text-xs w-36">
          <SelectValue placeholder={ph} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={QF_NONE}>{ph}</SelectItem>
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
      type={isNumeric ? 'number' : 'text'}
      className="h-8 px-2 text-xs w-36"
      value={value}
      placeholder={ph}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

/**
 * Zero-fill every series across the resolved date range and re-tag each
 * with its display label (so legend shows "Total" / "Other" / actual
 * groupBy values rather than the wire-format internal keys).
 */
function prepareSeries(
  series: ReadonlyArray<TimeSeriesSeries>,
  range: { from: string; to: string },
  step: AggregationStep,
  labelFor: (key: string) => string,
): { key: string; label: string; points: { date: string; value: number }[] }[] {
  const filled = fillTimeSeries(
    series.map((s) => ({ key: s.key, points: s.points })),
    range.from,
    range.to,
    step as Exclude<AggregationStep, 'all'> | 'all',
  )
  return filled.map((s) => ({
    key: s.key,
    label: labelFor(s.key),
    points: [...s.points],
  }))
}

interface KpiBodyProps {
  data: { series: ReadonlyArray<TimeSeriesSeries>; previous?: ReadonlyArray<TimeSeriesSeries> } | undefined
  labels: {
    noData: string
    deltaUp: string
    deltaDown: string
    deltaFlat: string
    previousPeriod: string
  }
}

/** KPI mode summarises the single-bucket response to one scalar. */
function KpiBody({ data, labels }: KpiBodyProps): React.ReactElement {
  const value = sumAll(data?.series)
  const prev = sumAll(data?.previous)
  return <KpiCard value={value} previousValue={prev} labels={labels} />
}

function sumAll(series: ReadonlyArray<TimeSeriesSeries> | undefined): number | null {
  if (!series || series.length === 0) return null
  let total = 0
  for (const s of series) for (const p of s.points) total += p.value
  return total
}

function kpiLabels(t: (key: string) => string): {
  noData: string
  deltaUp: string
  deltaDown: string
  deltaFlat: string
  previousPeriod: string
} {
  return {
    noData: t('chart:noData'),
    deltaUp: t('dashboard:widget.deltaUp'),
    deltaDown: t('dashboard:widget.deltaDown'),
    deltaFlat: t('dashboard:widget.deltaFlat'),
    previousPeriod: t('dashboard:widget.previousPeriod'),
  }
}
