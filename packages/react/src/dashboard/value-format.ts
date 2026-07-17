// Presentation-only value pipeline + number formatting for dashboard charts.
// Transforms mutate the data before it reaches Recharts (so axis, tooltip,
// KPI and delta all agree); formatting is applied only at render time.

import type { ChartFormat, ChartTransformStep } from '@modern-admin/core'

/**
 * Fold the ordered transform pipeline over a single value. A `divide` step
 * with value 0 is skipped rather than producing Infinity/NaN.
 */
export function applyTransform(
  value: number,
  steps: ReadonlyArray<ChartTransformStep> | undefined,
): number {
  if (!steps || steps.length === 0) return value
  let out = value
  for (const s of steps) {
    switch (s.op) {
      case 'divide':
        if (s.value !== 0) out /= s.value
        break
      case 'multiply':
        out *= s.value
        break
      case 'add':
        out += s.value
        break
      case 'subtract':
        out -= s.value
        break
    }
  }
  return out
}

/** Apply the transform pipeline to every point of every series. */
export function transformSeries<
  S extends { points: ReadonlyArray<{ value: number }> },
>(series: ReadonlyArray<S>, steps: ReadonlyArray<ChartTransformStep> | undefined): S[] {
  if (!steps || steps.length === 0) return [...series]
  return series.map((s) => ({
    ...s,
    points: s.points.map((p) => ({ ...p, value: applyTransform(p.value, steps) })),
  }))
}

/**
 * Tooltip / KPI number formatter from a persisted `ChartFormat`.
 * `percent` follows Intl semantics (0.42 → "42%"); the builder preview
 * makes that discoverable. Missing currency falls back to USD.
 */
export function makeValueFormatter(
  format: ChartFormat | undefined,
  locale = 'en-US',
): (n: number) => string {
  const nf = new Intl.NumberFormat(locale, intlOptions(format, false))
  return wrap(nf, format)
}

/**
 * Y-axis tick formatter — always compact (12.5k / 1.2M) with at most one
 * fraction digit so large values never blow up the axis gutter. This is the
 * default even when the chart has no explicit `format`.
 */
export function makeAxisFormatter(
  format: ChartFormat | undefined,
  locale = 'en-US',
): (n: number) => string {
  const nf = new Intl.NumberFormat(locale, {
    ...intlOptions(format, true),
    notation: 'compact',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })
  return wrap(nf, format)
}

function intlOptions(
  format: ChartFormat | undefined,
  axis: boolean,
): Intl.NumberFormatOptions {
  const opts: Intl.NumberFormatOptions = {}
  if (format?.style === 'currency') {
    opts.style = 'currency'
    opts.currency = format.currency ?? 'USD'
  } else if (format?.style === 'percent') {
    opts.style = 'percent'
  }
  if (!axis) {
    if (format?.compact) opts.notation = 'compact'
    if (format?.decimals != null) {
      opts.minimumFractionDigits = format.decimals
      opts.maximumFractionDigits = format.decimals
    }
  }
  return opts
}

function wrap(
  nf: Intl.NumberFormat,
  format: ChartFormat | undefined,
): (n: number) => string {
  const prefix = format?.prefix ?? ''
  const suffix = format?.suffix ?? ''
  return (n: number): string => {
    if (!Number.isFinite(n)) return String(n)
    return `${prefix}${nf.format(n)}${suffix}`
  }
}
