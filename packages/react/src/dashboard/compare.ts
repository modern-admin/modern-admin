// Previous-period comparison helpers for dashboard charts.
//
// The adapters compute the previous window as `prevTo = from`,
// `prevFrom = from − (to − from)` where the wire `from`/`to` are
// start-of-day / end-of-day instants. In whole-day terms that is the
// N-day window ending the day before the current one starts — which is
// what `serverPreviousRangeOf` reproduces so client-side zero-fill and
// tooltips agree with the buckets the server actually returns. (The
// degenerate 1 ms boundary bucket at `from` itself is dropped.)

import type { TimeSeriesSeries, TimeSeriesStep } from '../client.js'
import { generateBuckets } from './time-series.js'

/** Prefix marking overlay series produced from the previous window. */
export const PREVIOUS_KEY_PREFIX = '__prev__:'

export interface AlignedPreviousPoint {
  /** Current-window bucket the point is plotted on. */
  date: string
  value: number
  /** Real previous-window bucket the value came from (for tooltips). */
  sourceDate?: string
}

export interface AlignedPreviousSeries {
  key: string
  /** Key of the paired current-window series (`__total__`, …). */
  sourceKey: string
  points: AlignedPreviousPoint[]
}

/**
 * Whole-day previous window matching the adapters' formula: for a current
 * window of N days `[from, to]`, returns `[from − N, from − 1]`.
 */
export function serverPreviousRangeOf(range: {
  from: string
  to: string
}): { from: string; to: string } | null {
  const f = Date.parse(`${range.from}T00:00:00.000Z`)
  const t = Date.parse(`${range.to}T00:00:00.000Z`)
  if (Number.isNaN(f) || Number.isNaN(t) || t < f) return null
  const days = Math.round((t - f) / 86_400_000) + 1
  return {
    from: ymd(new Date(f - days * 86_400_000)),
    to: ymd(new Date(f - 86_400_000)),
  }
}

/**
 * Zero-fill the previous window and re-plot each point onto the current
 * window's bucket axis (point *i* → `currentBuckets[i]`), keeping the real
 * date in `sourceDate`. When bucket counts differ (step-aligned month/week
 * windows drift by ±1) the series are aligned on their END — "yesterday
 * lines up with yesterday" — and leading gaps become zeros.
 */
export function alignPreviousSeries(
  previous: ReadonlyArray<TimeSeriesSeries>,
  prevRange: { from: string; to: string },
  currentBuckets: ReadonlyArray<string>,
  step: TimeSeriesStep,
): AlignedPreviousSeries[] {
  if (currentBuckets.length === 0) return []
  const prevBuckets = generateBuckets(prevRange.from, prevRange.to, step)
  const offset = currentBuckets.length - prevBuckets.length
  return previous.map((s) => {
    const map = new Map(s.points.map((p) => [p.date, p.value]))
    const points: AlignedPreviousPoint[] = currentBuckets.map((date, i) => {
      const src = prevBuckets[i - offset]
      return src === undefined
        ? { date, value: 0 }
        : { date, value: map.get(src) ?? 0, sourceDate: src }
    })
    return { key: `${PREVIOUS_KEY_PREFIX}${s.key}`, sourceKey: s.key, points }
  })
}

/** Total across all points of all series (raw, pre-transform values). */
export function sumSeries(
  series: ReadonlyArray<TimeSeriesSeries> | undefined,
): number | null {
  if (!series || series.length === 0) return null
  let total = 0
  for (const s of series) for (const p of s.points) total += p.value
  return total
}

export interface PeriodDelta {
  /** Signed percentage, one decimal place (e.g. -81.7). */
  percent: number
  direction: 'up' | 'down' | 'flat'
}

/**
 * Period-over-period delta on raw totals: `(cur − prev) / prev`. Returns
 * null when the previous total is missing or 0 (undefined percentage).
 */
export function computeDelta(
  current: number | null,
  previous: number | null,
): PeriodDelta | null {
  if (current == null || previous == null || previous === 0) return null
  const percent = Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10
  return {
    percent,
    direction: percent > 0 ? 'up' : percent < 0 ? 'down' : 'flat',
  }
}

const ymd = (d: Date): string => d.toISOString().slice(0, 10)
