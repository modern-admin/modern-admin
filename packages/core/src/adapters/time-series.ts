// Shared time-series helpers for ORM adapters.
//
// `aggregateTimeSeries` is implemented differently per adapter — Prisma buckets
// rows in JS (its typed client can't `DATE_TRUNC`), Drizzle pushes bucketing
// into SQL — but the surrounding scalar/date utilities and the human-readable
// "display SQL" string are identical. They live here so both adapters share one
// copy.

import type { Filter } from '../filter/filter.js'
import type { TimeSeriesQuery, TimeSeriesStep } from './types.js'

/** SQL dialects the adapters target. Matches each adapter's own dialect union. */
export type SqlDialect = 'pg' | 'mysql' | 'sqlite'

/** Default ceiling on rows bucketed in memory by a JS-side `aggregateTimeSeries`. */
export const DEFAULT_TIME_SERIES_ROW_CAP = 100_000

/** `YYYY-MM-DD` slice of an ISO timestamp — the canonical bucket-key format. */
export const isoDate = (d: Date): string => d.toISOString().slice(0, 10)

/** Best-effort coercion of a DB value to a `Date`. */
export const toDate = (v: unknown): Date => {
  if (v instanceof Date) return v
  if (typeof v === 'string' || typeof v === 'number') return new Date(v)
  return new Date(String(v))
}

/** Best-effort coercion of a DB value to a finite number (0 on failure). */
export const toNumber = (v: unknown): number => {
  if (typeof v === 'number') return v
  if (v == null) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Stable string key for a group-by value, with sentinels for null. */
export const stringifyKey = (v: unknown): string => {
  if (v == null) return '__null__'
  if (typeof v === 'string') return v
  return String(v)
}

/** Sum the numeric values of a `Map`. */
export const sumValues = (m: Map<string, number>): number => {
  let s = 0
  for (const v of m.values()) s += v
  return s
}

/** Truncate a date to the start of its `step` bucket, as a `YYYY-MM-DD` key. */
export const truncateDate = (d: Date, step: TimeSeriesStep): string => {
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  const day = d.getUTCDate()
  switch (step) {
  case 'day':
    return isoDate(new Date(Date.UTC(y, m, day)))
  case 'week': {
    // ISO week: Monday-based.
    const dow = (d.getUTCDay() + 6) % 7 // 0 = Mon
    const monday = new Date(Date.UTC(y, m, day - dow))
    return isoDate(monday)
  }
  case 'month':
    return isoDate(new Date(Date.UTC(y, m, 1)))
  case 'year':
    return isoDate(new Date(Date.UTC(y, 0, 1)))
  case 'all':
    return isoDate(d)
  }
}

// Week is not expressible as a plain format string — both adapters bucket
// weeks to the ISO Monday as `YYYY-MM-DD` (see each adapter's bucket
// expression), so it is special-cased in buildDisplaySql below.
const stepFmt = (step: TimeSeriesStep): string =>
  step === 'day' ? "'%Y-%m-%d'" : step === 'month' ? "'%Y-%m-01'" : "'%Y-01-01'"

/**
 * Build the human-readable SQL string surfaced alongside a time-series result
 * (for the "show SQL" affordance). This is display-only — never executed — so
 * both adapters render the same dialect-appropriate query text.
 */
export const buildDisplaySql = (
  dialect: SqlDialect,
  tableName: string,
  query: TimeSeriesQuery,
  filter: Filter,
): string => {
  const ident = (s: string) => (dialect === 'mysql' ? `\`${s}\`` : `"${s}"`)
  // Render a value as a SQL string literal, escaping embedded single quotes by
  // doubling them (SQL standard). Display-only, but this keeps the surfaced
  // query valid and safe to copy-paste.
  const lit = (v: unknown) => `'${String(v).replace(/'/g, "''")}'`
  const t = ident(tableName)
  const dateCol = ident(query.dateField)
  const bucket =
    query.step === 'all'
      ? `MIN(${dateCol})`
      : dialect === 'pg'
        ? `DATE_TRUNC('${query.step}', ${dateCol})`
        : dialect === 'mysql'
          ? query.step === 'week'
            ? `DATE(DATE_SUB(${dateCol}, INTERVAL WEEKDAY(${dateCol}) DAY))`
            : `DATE_FORMAT(${dateCol}, ${stepFmt(query.step)})`
          : query.step === 'week'
            ? `DATE(${dateCol}, '-' || ((CAST(STRFTIME('%w', ${dateCol}) AS INTEGER) + 6) % 7) || ' days')`
            : `STRFTIME(${stepFmt(query.step)}, ${dateCol})`
  const metric =
    query.metric === 'count'
      ? 'COUNT(*)'
      : `${query.metric.toUpperCase()}(${ident(query.field as string)})`
  const cols: string[] = []
  if (query.step !== 'all') cols.push(`${bucket} AS bucket`)
  cols.push(`${metric} AS value`)
  if (query.groupBy) cols.push(`${ident(query.groupBy)} AS series_key`)
  const where: string[] = [
    `${dateCol} >= ${lit(query.from.toISOString())}`,
    `${dateCol} <= ${lit(query.to.toISOString())}`,
  ]
  filter.reduce<null>((_, el) => {
    where.push(`${ident(el.path)} = ${lit(el.value)}`)
    return null
  }, null)
  const groupBy: string[] = []
  if (query.step !== 'all') groupBy.push('bucket')
  if (query.groupBy) groupBy.push('series_key')
  const lines = [
    `SELECT ${cols.join(', ')}`,
    `FROM ${t}`,
    `WHERE ${where.join(' AND ')}`,
  ]
  if (groupBy.length) lines.push(`GROUP BY ${groupBy.join(', ')}`)
  if (query.step !== 'all') lines.push('ORDER BY bucket ASC')
  return lines.join('\n')
}
