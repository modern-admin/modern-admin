import * as React from 'react'
import {
  ResponsiveContainer,
  LineChart,
  AreaChart,
  BarChart,
  PieChart,
  Line,
  Area,
  Bar,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
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
const GRID_STROKE = 'hsl(215 16% 85%)'

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
      <div className={cn('w-full', className)} style={{ height }}>
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
                <Cell key={i} fill={PALETTE[i % PALETTE.length]!} />
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
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ChartCmp data={mapped} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
          <XAxis
            dataKey="label"
            tick={AXIS_STYLE}
            interval="preserveStartEnd"
            tickLine={false}
            axisLine={false}
          />
          <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
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
            <Bar dataKey={vKey} fill={color} radius={[3, 3, 0, 0] as never} maxBarSize={48} />
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
  /** Aligned points — every series MUST share the same `date` axis (zero-filled upstream). */
  points: ReadonlyArray<{ date: string; value: number }>
}

export interface TimeSeriesChartLabels {
  noData?: string
  showAll?: string
  hideAll?: string
}

export interface TimeSeriesChartProps {
  series: ReadonlyArray<TimeSeriesChartSeries>
  height?: number
  /** ISO `YYYY-MM-DD` → short axis tick (e.g. `01.05`). */
  tickFormatter?: (iso: string) => string
  /** ISO `YYYY-MM-DD` → tooltip header (e.g. `01 May 2024`). */
  labelFormatter?: (iso: string) => string
  /** Tooltip / Y-axis number formatting. */
  valueFormatter?: (value: number) => string
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

function paletteFor(n: number): string[] {
  if (n <= TS_PALETTE.length) return TS_PALETTE.slice(0, Math.max(n, 1)) as string[]
  const stepDeg = Math.floor(360 / n)
  return Array.from({ length: n }, (_, i) => `hsl(${stepDeg * (i + 1)}, 55%, 55%)`)
}

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

/**
 * Date-axis chart used by dashboard widgets. Renders an `AreaChart` for
 * ≤2 series (single-metric look) and a `LineChart` for more (multi-series
 * comparison). Legend is clickable: click a label to toggle that series'
 * visibility; hover dims the rest. When >7 series a "show/hide all"
 * button appears under the chart.
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
  labels,
  className,
}: TimeSeriesChartProps): React.ReactElement {
  const [hovered, setHovered] = React.useState<string | null>(null)
  const [hidden, setHidden] = React.useState<ReadonlySet<string>>(() => new Set())

  // Merge all series into row-oriented data keyed by date. Memoized so
  // Recharts only sees a new `data` prop when series content actually changes.
  // Uses per-series Maps for O(1) lookup instead of O(N) `.find()` per date.
  const { rows, palette, tickInterval } = React.useMemo(() => {
    const dates = Array.from(
      new Set(series.flatMap((s) => s.points.map((p) => p.date))),
    ).sort()
    const maps = series.map((s) => new Map(s.points.map((p) => [p.date, p.value])))
    const rows = dates.map((date) => {
      const row: Record<string, string | number> = { date }
      series.forEach((s, i) => {
        row[s.key] = maps[i]!.get(date) ?? 0
      })
      return row
    })
    return {
      rows,
      palette: paletteFor(series.length),
      tickInterval: Math.max(0, Math.floor(dates.length / 32)),
    }
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

  const useLineChart = series.length > 2
  const ChartCmp = useLineChart ? LineChart : AreaChart
  // Suppress animation for large datasets — animating thousands of path
  // points is expensive and retains old state in Recharts' animation subsystem.
  const animateChart = rows.length <= 200

  const toggleHidden = (key: string): void => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const allHidden = hidden.size === series.length
  const handleToggleAll = (): void => {
    setHidden(allHidden ? new Set() : new Set(series.map((s) => s.key)))
  }

  const formatValue = (v: number | string): string => {
    const n = typeof v === 'number' ? v : Number(v)
    if (!Number.isFinite(n)) return String(v)
    return valueFormatter ? valueFormatter(n) : new Intl.NumberFormat().format(n)
  }

  return (
    <div className={cn('w-full', className)}>
      <ResponsiveContainer width="100%" height={height}>
        <ChartCmp data={rows} margin={{ top: 16, right: 20, left: -20, bottom: 8 }}>
          <CartesianGrid strokeDasharray="6 6" stroke={GRID_STROKE} />
          <XAxis
            dataKey="date"
            tick={AXIS_STYLE}
            interval={tickInterval}
            tickLine={false}
            axisLine={false}
            tickFormatter={tickFormatter}
          />
          <YAxis
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => formatValue(v as number)}
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
            formatter={(value, name) => [formatValue(value as number | string), name]}
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
          {series.map((s, i) =>
            useLineChart ? (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={palette[i]}
                strokeWidth={2}
                strokeOpacity={hovered === null || hovered === s.key ? 1 : 0.2}
                dot={false}
                activeDot={{ r: 4 }}
                hide={hidden.has(s.key)}
                isAnimationActive={animateChart}
                animationDuration={300}
              />
            ) : (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={palette[i]}
                strokeWidth={2}
                fill={palette[i]}
                fillOpacity={0.25}
                dot={false}
                activeDot={{ r: 4 }}
                hide={hidden.has(s.key)}
                isAnimationActive={animateChart}
                animationDuration={300}
              />
            ),
          )}
        </ChartCmp>
      </ResponsiveContainer>
      {series.length > 7 && (
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
