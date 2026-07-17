import * as React from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { cn } from '../lib/utils.js'

export type ChartType = 'line' | 'area' | 'bar' | 'pie'

export interface ChartDataPoint {
  label: string
  value: number
}

export interface ChartPanelLabels {
  noData?: string
  value?: string
}

export interface ChartPanelProps {
  data: ChartDataPoint[]
  type?: ChartType
  color?: string
  height?: number
  labels?: ChartPanelLabels
  className?: string
}

const PALETTE = [
  'hsl(220, 70%, 55%)',
  'hsl(160, 60%, 45%)',
  'hsl(30, 80%, 55%)',
  'hsl(280, 65%, 60%)',
  'hsl(0, 65%, 55%)',
]

const TOOLTIP_STYLE: React.CSSProperties = {
  background: 'var(--card, #fff)',
  border: '1px solid var(--border, #e2e8f0)',
  borderRadius: '6px',
  fontSize: 12,
  padding: '6px 10px',
}

const AXIS_STYLE = { fontSize: 11 }
// Recessive grid that stays visible in BOTH themes. `--border` can't be used
// here: it's a bare HSL triplet (invalid as a raw `stroke`) and, wrapped, it's
// near-black on the dark surface. `--muted-foreground` is a mid-gray in light
// and a light-gray in dark, so a low-opacity stroke reads on either surface.
const GRID_STROKE = 'hsl(var(--muted-foreground))'
const GRID_OPACITY = 0.3

export function ChartPanel({
  data,
  type = 'line',
  color = PALETTE[0]!,
  height = 260,
  labels,
  className,
}: ChartPanelProps): React.ReactElement {
  if (data.length === 0) {
    return (
      <div
        className={cn(
          'flex items-center justify-center text-sm text-muted-foreground',
          className,
        )}
        style={{ height }}
      >
        {labels?.noData ?? 'No data'}
      </div>
    )
  }

  const vKey = labels?.value ?? 'value'
  const mapped = data.map((d) => ({ label: d.label, [vKey]: d.value }))

  if (type === 'pie') {
    return (
      <div
        className={cn(
          'w-full [&_*:focus]:outline-none [&_*:focus-visible]:outline-none',
          className,
        )}
        style={{ height }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={mapped}
              dataKey={vKey}
              nameKey="label"
              cx="50%"
              cy="50%"
              outerRadius="65%"
            >
              {mapped.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]!}/>
              ))}
            </Pie>
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value) => [value, vKey]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    )
  }

  const ChartCmp =
    type === 'area' ? AreaChart : type === 'bar' ? BarChart : LineChart

  return (
    <div
      className={cn(
        'w-full [&_*:focus]:outline-none [&_*:focus-visible]:outline-none',
        className,
      )}
      style={{ height }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ChartCmp data={mapped} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="1 1" stroke={GRID_STROKE} strokeOpacity={GRID_OPACITY}/>
          <XAxis
            dataKey="label"
            tick={AXIS_STYLE}
            interval="preserveStartEnd"
            tickLine={false}
            axisLine={false}
          />
          <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false}/>
          <Tooltip contentStyle={TOOLTIP_STYLE}/>
          {type === 'area' ? (
            <Area
              type="monotone"
              dataKey={vKey}
              stroke={color}
              fill={color}
              fillOpacity={0.18}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ) : type === 'bar' ? (
            <Bar dataKey={vKey} fill={color} radius={[3, 3, 0, 0] as never} maxBarSize={48}/>
          ) : (
            <Line
              type="monotone"
              dataKey={vKey}
              stroke={color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          )}
        </ChartCmp>
      </ResponsiveContainer>
    </div>
  )
}

// ─── KPI ────────────────────────────────────────────────────────────────

export interface KpiCardLabels {
  noData?: string
  /** Template with `{value}` and `{percent}` placeholders. */
  deltaUp?: string
  deltaDown?: string
  deltaFlat?: string
  previousPeriod?: string
}

export interface KpiCardProps {
  /** Aggregated value over the current window. */
  value: number | null | undefined
  /** Aggregated value over the equal-length previous window. */
  previousValue?: number | null
  /** Custom number formatter — defaults to `Intl.NumberFormat()`. */
  formatNumber?: (n: number) => string
  labels?: KpiCardLabels
  className?: string
}

const defaultFormat = (n: number): string => new Intl.NumberFormat().format(n)

const fillTemplate = (tpl: string, value: string, percent: string): string =>
  tpl.replace('{value}', value).replace('{percent}', percent)

/**
 * Big-number KPI card with optional period-over-period delta. Renders a
 * single value when `previousValue` is null/undefined; otherwise shows the
 * absolute and percentage difference and tints up/down/flat.
 *
 * i18n-unaware: pass localised templates via `labels`. Templates use
 * `{value}` / `{percent}` placeholders which are substituted at render time.
 */
export function KpiCard({
  value,
  previousValue,
  formatNumber = defaultFormat,
  labels,
  className,
}: KpiCardProps): React.ReactElement {
  if (value == null) {
    return (
      <div
        className={cn(
          'flex h-32 items-center justify-center text-sm text-muted-foreground',
          className,
        )}
      >
        {labels?.noData ?? 'No data'}
      </div>
    )
  }

  const hasPrev = previousValue != null && Number.isFinite(previousValue)
  const delta = hasPrev ? value - (previousValue as number) : 0
  const percent = hasPrev && (previousValue as number) !== 0
    ? Math.round((delta / (previousValue as number)) * 1000) / 10
    : 0

  const direction: 'up' | 'down' | 'flat' =
    !hasPrev ? 'flat' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'

  const tone =
    direction === 'up'
      ? 'text-emerald-600 dark:text-emerald-400'
      : direction === 'down'
        ? 'text-rose-600 dark:text-rose-400'
        : 'text-muted-foreground'

  const tpl =
    direction === 'up'
      ? labels?.deltaUp ?? '+{value} ({percent}%)'
      : direction === 'down'
        ? labels?.deltaDown ?? '−{value} ({percent}%)'
        : labels?.deltaFlat ?? '{value} ({percent}%)'

  return (
    <div className={cn('flex h-32 flex-col justify-center px-1', className)}>
      <div className="text-3xl font-semibold tabular-nums sm:text-4xl">
        {formatNumber(value)}
      </div>
      {hasPrev && (
        <div className={cn('mt-2 text-xs sm:text-sm', tone)}>
          <span className="tabular-nums">
            {fillTemplate(
              tpl,
              formatNumber(Math.abs(delta)),
              String(Math.abs(percent)),
            )}
          </span>
          {labels?.previousPeriod && (
            <span className="ml-1 text-muted-foreground">
              {labels.previousPeriod}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Time-series chart ───────────────────────────────────────────────────

export interface TimeSeriesChartSeries {
  /** Stable key (used for React keys). */
  key: string
  /** Human-readable label shown in legend / tooltip. */
  label: string
  /**
   * Aligned points — every series MUST share the same `date` axis
   * (zero-filled upstream). `sourceDate` marks re-plotted points (previous-
   * period overlay); the tooltip then shows the real date next to the label.
   */
  points: ReadonlyArray<{ date: string; value: number; sourceDate?: string }>
  /** Explicit color — overrides the palette slot for this series' index. */
  color?: string
  /** Dashed muted overlay (previous-period style). Rendered as a line, kept out of the legend. */
  dashed?: boolean
  /**
   * Key of the primary series this one follows: it hides/dims together with
   * that series and inherits its color when `color` is not set.
   */
  hiddenWith?: string
}

export interface TimeSeriesChartLabels {
  noData?: string
  showAll?: string
  hideAll?: string
}

export type TimeSeriesChartVisualisation = 'area' | 'line' | 'bar'

export interface TimeSeriesChartProps {
  series: ReadonlyArray<TimeSeriesChartSeries>
  height?: number
  /** ISO `YYYY-MM-DD` → short axis tick (e.g. `01.05`). */
  tickFormatter?: (iso: string) => string
  /** ISO `YYYY-MM-DD` → tooltip header (e.g. `01 May 2024`). */
  labelFormatter?: (iso: string) => string
  /** Tooltip number formatting (also Y-axis fallback). */
  valueFormatter?: (value: number) => string
  /**
   * Y-axis tick formatting. Falls back to `valueFormatter`, then to a
   * compact `Intl.NumberFormat` (12.5K / 1.2M) so large values never
   * overflow the axis gutter.
   */
  axisValueFormatter?: (value: number) => string
  /**
   * Forces a specific Recharts primitive. When omitted, falls back to an
   * auto heuristic: `area` for ≤2 series (single-metric look), `line`
   * for more (multi-series comparison).
   */
  visualisation?: TimeSeriesChartVisualisation
  labels?: TimeSeriesChartLabels
  className?: string
}

// Six-color HSL palette mirroring the legacy AdminJS dashboard. For >6
// series we generate evenly-spaced hues so each line stays distinguishable.
const TS_PALETTE = [
  'hsl(2, 50%, 50%)',
  'hsl(25, 56%, 50%)',
  'hsl(48, 65%, 49%)',
  'hsl(189, 50%, 50%)',
  'hsl(143, 60%, 55%)',
  'hsl(286, 70%, 55%)',
] as const

export function paletteFor(n: number): string[] {
  if (n <= TS_PALETTE.length) return TS_PALETTE.slice(0, Math.max(n, 1)) as string[]
  const stepDeg = Math.floor(360 / n)
  return Array.from({ length: n }, (_, i) => `hsl(${stepDeg * (i + 1)}, 55%, 55%)`)
}

/** Hex twins of `TS_PALETTE` — persisted color overrides are stored as hex. */
export const CHART_COLOR_PRESETS = [
  '#bf4440',
  '#c77438',
  '#ceae2c',
  '#40acbf',
  '#47d17c',
  '#b73cdd',
] as const

const TS_TOOLTIP_STYLE: React.CSSProperties = {
  background: 'hsla(220, 10%, 12%, 0.92)',
  border: '1px solid hsla(220, 10%, 30%, 0.5)',
  borderRadius: 6,
  color: '#fff',
  fontSize: 12,
  padding: '6px 10px',
}

const TS_TOOLTIP_LABEL_STYLE: React.CSSProperties = {
  textAlign: 'center',
  color: '#fff',
  marginBottom: 2,
}

const compactAxisFormat = (locale?: string): ((n: number) => string) => {
  const nf = new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  })
  return (n) => nf.format(n)
}

/**
 * Date-axis chart used by dashboard widgets. The Recharts primitive is
 * chosen by `visualisation` (`area` | `line` | `bar`). When the caller
 * does not pass `visualisation` the component falls back to a heuristic:
 * `area` for ≤2 primary series (single-metric look) and `line` for more
 * (multi-series comparison).
 *
 * Legend is clickable: click a label to toggle that series' visibility;
 * hover dims the rest. When >7 primary series a "show/hide all" button
 * appears under the chart.
 *
 * `dashed` series (previous-period overlays) are always drawn as muted
 * dashed lines, stay out of the legend, and hide/dim together with the
 * primary series named by their `hiddenWith`.
 *
 * The chart adapts to its measured width: fewer X ticks and a capped
 * height on narrow containers so mobile keeps the desktop look.
 *
 * Pure presentation — i18n-unaware. Caller supplies pre-aligned, zero-
 * filled `series` plus locale-aware tick/label/value formatters.
 */
export function TimeSeriesChart({
  series,
  height = 320,
  tickFormatter,
  labelFormatter,
  valueFormatter,
  axisValueFormatter,
  visualisation,
  labels,
  className,
}: TimeSeriesChartProps): React.ReactElement {
  const [hovered, setHovered] = React.useState<string | null>(null)
  const [hidden, setHidden] = React.useState<ReadonlySet<string>>(() => new Set())
  const [width, setWidth] = React.useState<number | null>(null)

  // Merge all series into row-oriented data keyed by date. Memoized so
  // Recharts only sees a new `data` prop when series content actually changes.
  // Uses per-series Maps for O(1) lookup instead of O(N) `.find()` per date.
  // Re-plotted points (previous-period overlay) carry their real date in a
  // `<key>__src` column so the tooltip can show it.
  const { rows, colorByKey, primary } = React.useMemo(() => {
    const dates = Array.from(
      new Set(series.flatMap((s) => s.points.map((p) => p.date))),
    ).sort()
    const maps = series.map(
      (s) => new Map(s.points.map((p) => [p.date, p] as const)),
    )
    const rows = dates.map((date) => {
      const row: Record<string, string | number> = { date }
      series.forEach((s, i) => {
        const p = maps[i]!.get(date)
        row[s.key] = p?.value ?? 0
        if (p?.sourceDate) row[`${s.key}__src`] = p.sourceDate
      })
      return row
    })
    // Palette slots belong to primary (non-dashed) series only; dashed
    // overlays inherit their paired series' color unless overridden.
    const primary = series.filter((s) => !s.dashed)
    const palette = paletteFor(primary.length)
    const colorByKey = new Map<string, string>()
    primary.forEach((s, i) => colorByKey.set(s.key, s.color ?? palette[i]!))
    series.forEach((s) => {
      if (!s.dashed) return
      colorByKey.set(
        s.key,
        s.color ??
        (s.hiddenWith ? colorByKey.get(s.hiddenWith) : undefined) ??
        palette[0]!,
      )
    })
    return { rows, colorByKey, primary }
  }, [series])

  if (series.length === 0 || series.every((s) => s.points.length === 0)) {
    return (
      <div
        className={cn(
          'flex items-center justify-center text-sm text-muted-foreground',
          className,
        )}
        style={{ height }}
      >
        {labels?.noData ?? 'No data'}
      </div>
    )
  }

  // Explicit `visualisation` wins; otherwise auto: area for ≤2 primary
  // series, line for more (preserves legacy behaviour for callers that
  // don't pass `visualisation`).
  const resolvedVis: TimeSeriesChartVisualisation =
    visualisation ?? (primary.length > 2 ? 'line' : 'area')
  const hasOverlay = series.some((s) => s.dashed)
  // Dashed overlays are always Lines, so mixing them with bars/areas needs
  // ComposedChart; the dedicated chart types stay for the common case.
  const ChartCmp = hasOverlay
    ? ComposedChart
    : resolvedVis === 'bar' ? BarChart
      : resolvedVis === 'line' ? LineChart
        : AreaChart
  // Suppress animation for large datasets — animating thousands of path
  // points is expensive and retains old state in Recharts' animation subsystem.
  const animateChart = rows.length <= 200

  // Width-adaptive rendering: cap height and thin out X ticks on narrow
  // containers (mobile) so the chart keeps the desktop aspect and stays
  // readable instead of stretching tall with overlapping labels.
  const narrow = width !== null && width < 480
  const effectiveHeight = narrow ? Math.min(height, 230) : height
  const minTickGap = width !== null && width < 440 ? 40 : 24
  // Keep the background grid clearly readable on desktop but render it with a
  // thinner, fainter stroke on narrow (mobile) widths so it doesn't turn into
  // a heavy lattice on small cards.
  const gridStrokeWidth = narrow ? 0.5 : 1
  const gridStrokeOpacity = narrow ? 0.18 : GRID_OPACITY

  const isHidden = (s: TimeSeriesChartSeries): boolean =>
    hidden.has(s.key) || (s.hiddenWith != null && hidden.has(s.hiddenWith))
  const isDimmed = (s: TimeSeriesChartSeries): boolean =>
    hovered !== null && hovered !== s.key && hovered !== s.hiddenWith

  const toggleHidden = (key: string): void => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const allHidden = primary.every((s) => hidden.has(s.key))
  const handleToggleAll = (): void => {
    setHidden(allHidden ? new Set() : new Set(primary.map((s) => s.key)))
  }

  const formatValue = (v: number | string): string => {
    const n = typeof v === 'number' ? v : Number(v)
    if (!Number.isFinite(n)) return String(v)
    return valueFormatter ? valueFormatter(n) : new Intl.NumberFormat().format(n)
  }
  const formatAxisValue = (n: number): string => {
    if (!Number.isFinite(n)) return String(n)
    if (axisValueFormatter) return axisValueFormatter(n)
    if (valueFormatter) return valueFormatter(n)
    return compactAxisFormat()(n)
  }

  return (
    <div
      className={cn(
        'w-full [&_*:focus]:outline-none [&_*:focus-visible]:outline-none',
        className,
      )}
    >
      <ResponsiveContainer
        width="100%"
        height={effectiveHeight}
        onResize={(w) => {
          if (typeof w === 'number' && w > 0) setWidth(w)
        }}
      >
        <ChartCmp data={rows} margin={{ top: 16, right: 12, left: 0, bottom: 8 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={GRID_STROKE}
            strokeWidth={gridStrokeWidth}
            strokeOpacity={gridStrokeOpacity}
            // Draw evenly-spaced vertical lines across the plot instead of
            // tying them to the (thinned) X-axis ticks — `preserveStartEnd`
            // drops the near-end tick, which otherwise leaves a ragged gap on
            // the right. Horizontal lines stay tied to the Y ticks.
            verticalCoordinatesGenerator={(props: {
              offset?: { left?: number; width?: number }
            }) => {
              const left = props.offset?.left ?? 0
              const w = props.offset?.width ?? 0
              if (w <= 0) return []
              const target = narrow ? 56 : 96
              const count = Math.max(2, Math.round(w / target))
              const stepPx = w / count
              return Array.from({ length: count - 1 }, (_, i) =>
                Math.round(left + stepPx * (i + 1)),
              )
            }}
          />
          <XAxis
            dataKey="date"
            tick={AXIS_STYLE}
            interval="preserveStartEnd"
            minTickGap={minTickGap}
            tickLine={false}
            axisLine={false}
            tickFormatter={tickFormatter}
          />
          <YAxis
            width="auto"
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => formatAxisValue(Number(v))}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={TS_TOOLTIP_STYLE}
            labelStyle={TS_TOOLTIP_LABEL_STYLE}
            itemStyle={{ color: '#fff' }}
            cursor={{ stroke: 'hsla(0, 0%, 50%, 0.4)', strokeWidth: 1 }}
            labelFormatter={(value) =>
              labelFormatter ? labelFormatter(String(value)) : String(value)
            }
            formatter={(value, name, item) => {
              const key = (item as { dataKey?: unknown })?.dataKey
              const row = (item as { payload?: Record<string, unknown> })?.payload
              const src =
                typeof key === 'string' && row ? row[`${key}__src`] : undefined
              const displayName =
                typeof src === 'string'
                  ? `${String(name)} · ${labelFormatter ? labelFormatter(src) : src}`
                  : name
              return [formatValue(value as number | string), displayName]
            }}
          />
          <Legend
            layout="horizontal"
            align="center"
            verticalAlign="bottom"
            wrapperStyle={{ fontSize: 12 }}
            onClick={(data) => {
              const key = data.dataKey as string | undefined
              if (key) toggleHidden(key)
            }}
            onMouseEnter={(data) => {
              const key = data.dataKey as string | undefined
              if (key) setHovered(key)
            }}
            onMouseLeave={() => setHovered(null)}
          />
          {series.map((s) => {
            const color = colorByKey.get(s.key)
            if (s.dashed) {
              return (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={color}
                  strokeWidth={1.5}
                  strokeDasharray="6 5"
                  strokeOpacity={isDimmed(s) ? 0.15 : 0.55}
                  dot={false}
                  activeDot={{ r: 3 }}
                  legendType="none"
                  hide={isHidden(s)}
                  isAnimationActive={animateChart}
                  animationDuration={300}
                />
              )
            }
            if (resolvedVis === 'line') {
              return (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={color}
                  strokeWidth={2}
                  strokeOpacity={isDimmed(s) ? 0.2 : 1}
                  dot={false}
                  activeDot={{ r: 4 }}
                  hide={isHidden(s)}
                  isAnimationActive={animateChart}
                  animationDuration={300}
                />
              )
            }
            if (resolvedVis === 'bar') {
              return (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  fill={color}
                  fillOpacity={isDimmed(s) ? 0.25 : 1}
                  radius={[3, 3, 0, 0] as never}
                  maxBarSize={48}
                  hide={isHidden(s)}
                  isAnimationActive={animateChart}
                  animationDuration={300}
                />
              )
            }
            return (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={color}
                strokeWidth={2}
                strokeOpacity={isDimmed(s) ? 0.2 : 1}
                fill={color}
                fillOpacity={isDimmed(s) ? 0.08 : 0.25}
                dot={false}
                activeDot={{ r: 4 }}
                hide={isHidden(s)}
                isAnimationActive={animateChart}
                animationDuration={300}
              />
            )
          })}
        </ChartCmp>
      </ResponsiveContainer>
      {primary.length > 7 && (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={handleToggleAll}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {allHidden ? labels?.showAll ?? 'Show all' : labels?.hideAll ?? 'Hide all'}
          </button>
        </div>
      )}
    </div>
  )
}
