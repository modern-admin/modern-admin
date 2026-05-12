// Time-series UI helpers — bucket fill, tick formatting, label formatting.
// All zero-fill happens here on the client side (req: "Заполнение нулями
// должно быть только в ui, вне зависимости от адаптеров"). Adapters return
// only buckets that have data; the UI fabricates the rest at value 0 so
// charts don't have visual gaps.

import type {
  TimeSeriesPoint,
  TimeSeriesSeries,
  TimeSeriesStep,
} from '../client.js'

/** Generate a continuous sequence of `YYYY-MM-DD` bucket keys spanning [from, to]. */
export function generateBuckets(
  fromIso: string,
  toIso: string,
  step: TimeSeriesStep,
): string[] {
  if (step === 'all') return [fromIso.slice(0, 10)]
  const out: string[] = []
  const cur = startOf(new Date(fromIso), step)
  const end = startOf(new Date(toIso), step)
  while (cur.getTime() <= end.getTime()) {
    out.push(ymd(cur))
    advance(cur, step)
  }
  return out
}

/**
 * Zero-fill every series so each one has a value for every bucket in the
 * resolved date range. Missing buckets become `value: 0` rather than gaps,
 * which Recharts renders as flat segments instead of breaks.
 */
export function fillTimeSeries(
  series: TimeSeriesSeries[],
  fromIso: string,
  toIso: string,
  step: TimeSeriesStep,
): TimeSeriesSeries[] {
  const buckets = generateBuckets(fromIso, toIso, step)
  return series.map((s) => {
    const map = new Map(s.points.map((p) => [p.date, p.value]))
    const points: TimeSeriesPoint[] = buckets.map((date) => ({
      date,
      value: map.get(date) ?? 0,
    }))
    return { key: s.key, points }
  })
}

/**
 * X-axis tick formatter — short label format depending on bucket size.
 * day/week → DD.MM, month → MM.YYYY, year → YYYY.
 */
export function makeTickFormatter(
  step: TimeSeriesStep,
  locale = 'en-US',
): (iso: string) => string {
  const dayMonth = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit' })
  const monthYear = new Intl.DateTimeFormat(locale, { month: '2-digit', year: 'numeric' })
  const year = new Intl.DateTimeFormat(locale, { year: 'numeric' })
  return (iso: string): string => {
    const d = new Date(iso)
    if (step === 'year') return year.format(d)
    if (step === 'month') return monthYear.format(d)
    return dayMonth.format(d)
  }
}

/**
 * Tooltip label formatter — long, human-friendly form. For week buckets
 * we render `Mon DD – Sun DD` (the bucket plus 6 days).
 */
export function makeLabelFormatter(
  step: TimeSeriesStep,
  locale = 'en-US',
): (iso: string) => string {
  const fullDay = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
  const monthYear = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
  const year = new Intl.DateTimeFormat(locale, { year: 'numeric' })
  const shortDay = new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short' })
  return (iso: string): string => {
    const d = new Date(iso)
    if (step === 'year') return year.format(d)
    if (step === 'month') return monthYear.format(d)
    if (step === 'week') {
      const end = new Date(d)
      end.setDate(end.getDate() + 6)
      return `${shortDay.format(d)} – ${shortDay.format(end)}`
    }
    return fullDay.format(d)
  }
}

// ─── Internals ────────────────────────────────────────────────────────────

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function startOf(d: Date, step: TimeSeriesStep): Date {
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  if (step === 'week') {
    // Monday-anchored week.
    const dow = (out.getUTCDay() + 6) % 7
    out.setUTCDate(out.getUTCDate() - dow)
  } else if (step === 'month') {
    out.setUTCDate(1)
  } else if (step === 'year') {
    out.setUTCMonth(0, 1)
  }
  return out
}

function advance(d: Date, step: TimeSeriesStep): void {
  if (step === 'day') d.setUTCDate(d.getUTCDate() + 1)
  else if (step === 'week') d.setUTCDate(d.getUTCDate() + 7)
  else if (step === 'month') d.setUTCMonth(d.getUTCMonth() + 1)
  else if (step === 'year') d.setUTCFullYear(d.getUTCFullYear() + 1)
}
