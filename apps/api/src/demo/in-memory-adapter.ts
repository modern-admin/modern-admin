// Reference in-memory adapter so the API can boot without external infra.
// Demonstrates how a third-party adapter would slot in: subclass BaseDatabase
// and BaseResource, and ResourcesFactory wires them up automatically.

import {
  BaseDatabase,
  BaseProperty,
  BaseRecord,
  BaseResource,
  type Filter,
  type FindOptions,
  type ParamsType,
  type TimeSeriesQuery,
  type TimeSeriesResult,
  type TimeSeriesSeries,
  type TimeSeriesStep,
} from '@modern-admin/core'

export interface InMemoryRow {
  id: string
  [key: string]: unknown
}

export interface InMemoryTable {
  name: string
  /** Property declarations driving the generated UI / DTO. */
  properties: BaseProperty[]
  rows: InMemoryRow[]
}

export interface InMemoryDb {
  __inMemory: true
  tables: InMemoryTable[]
}

export class InMemoryDatabase extends BaseDatabase {
  constructor(private readonly db: InMemoryDb) {
    super(db)
  }

  static override isAdapterFor(input: unknown): boolean {
    return typeof input === 'object' && input !== null && (input as InMemoryDb).__inMemory === true
  }

  override resources(): BaseResource[] {
    return this.db.tables.map((t) => new InMemoryResource(t))
  }
}

export class InMemoryResource extends BaseResource {
  constructor(private readonly table: InMemoryTable) {
    super()
  }

  static override isAdapterFor(raw: unknown): boolean {
    return (
      typeof raw === 'object' &&
      raw !== null &&
      Array.isArray((raw as InMemoryTable).rows) &&
      Array.isArray((raw as InMemoryTable).properties)
    )
  }

  override id(): string {
    return this.table.name
  }

  override databaseName(): string {
    return 'in-memory'
  }

  override databaseType(): string {
    return 'demo'
  }

  override properties(): BaseProperty[] {
    return this.table.properties
  }

  /** Coerce a possibly-Date column value into an ISO 8601 string so we can
   * lexicographically compare against `yyyy-MM-dd` URL inputs. */
  private toIso(v: unknown): string {
    if (v instanceof Date) return v.toISOString()
    return String(v ?? '')
  }

  private matches(row: InMemoryRow, filter: Filter): boolean {
    const filters = filter.filters ?? {}
    for (const [path, entry] of Object.entries(filters)) {
      const needle = entry.value
      const operator = entry.operator
      // empty / nempty operators check absence — they must run BEFORE the
      // null-needle early continue below.
      if (operator === 'empty' || operator === 'nempty') {
        const v = row[path]
        const isEmpty = v == null || v === ''
        if (operator === 'empty' && !isEmpty) return false
        if (operator === 'nempty' && isEmpty) return false
        continue
      }

      if (needle == null || needle === '') continue

      // Unflattened range value produced by `field~~from` / `field~~to`
      // query params. Filter.unflatten merges them into a single element
      // with value `{from?, to?}`. We compare lexicographically — works
      // for ISO yyyy-MM-dd strings and for numeric strings the picker
      // produces.
      if (
        typeof needle === 'object' &&
        !Array.isArray(needle) &&
        ('from' in (needle as object) || 'to' in (needle as object))
      ) {
        const range = needle as { from?: string; to?: string }
        const rowVal = row[path]
        if (rowVal == null) return false
        const rowStr = this.toIso(rowVal)
        if (range.from && rowStr < range.from) return false
        // Use prefix-tolerant upper bound: if `to` is `yyyy-MM-dd`, any
        // ISO timestamp within that day starts with the same prefix and
        // sorts lexicographically <= `to + 'Z'`.
        if (range.to && rowStr > range.to + 'Z') return false
        continue
      }

      // Date-range filters: keys ending with _from / _to produced by the
      // date-range picker. Values are ISO date strings — lexicographic
      // comparison works because yyyy-MM-dd strings sort correctly.
      if (path.endsWith('_from') || path.endsWith('_to')) {
        const basePath = path.slice(0, path.lastIndexOf('_'))
        const value = String(row[basePath] ?? '')
        if (!value) continue
        const needleStr = String(needle)
        if (path.endsWith('_from') && value < needleStr) return false
        if (path.endsWith('_to') && value > needleStr) return false
        continue
      }

      const value = row[path]

      // Explicit operator branch — when the URL specified `OPERATOR:value`
      // (or a `~~op` qualifier) the Filter parser stripped the prefix and
      // surfaced `entry.operator`. Honour the requested semantics rather
      // than falling back to the legacy substring/equality match.
      if (operator) {
        switch (operator) {
          case 'eq': {
            // Numeric/boolean properties: coerce both sides to number to
            // avoid `"4.9" === 4.9` mismatches when the request encodes
            // the filter as a query-string.
            const propType = entry.property?.type?.()
            if (propType === 'number' || propType === 'float') {
              if (Number(value) !== Number(needle)) return false
            } else if (String(value ?? '') !== String(needle)) {
              return false
            }
            continue
          }
          case 'neq': {
            const propType = entry.property?.type?.()
            if (propType === 'number' || propType === 'float') {
              if (Number(value) === Number(needle)) return false
            } else if (String(value ?? '') === String(needle)) {
              return false
            }
            continue
          }
          case 'co': {
            if (!String(value ?? '').toLowerCase().includes(String(needle).toLowerCase())) return false
            continue
          }
          case 'nco': {
            if (String(value ?? '').toLowerCase().includes(String(needle).toLowerCase())) return false
            continue
          }
          case 'sw': {
            if (!String(value ?? '').toLowerCase().startsWith(String(needle).toLowerCase())) return false
            continue
          }
          case 'ew': {
            if (!String(value ?? '').toLowerCase().endsWith(String(needle).toLowerCase())) return false
            continue
          }
          case 'gt': {
            if (value == null) return false
            const propType = entry.property?.type?.()
            if (propType === 'date' || propType === 'datetime') {
              if (!(this.toIso(value) > String(needle))) return false
            } else if (!(Number(value) > Number(needle))) {
              return false
            }
            continue
          }
          case 'lt': {
            if (value == null) return false
            const propType = entry.property?.type?.()
            if (propType === 'date' || propType === 'datetime') {
              if (!(this.toIso(value) < String(needle))) return false
            } else if (!(Number(value) < Number(needle))) {
              return false
            }
            continue
          }
          case 'in': {
            const list = Array.isArray(needle) ? needle.map(String) : String(needle).split(',')
            if (Array.isArray(value)) {
              if (!value.some((v) => list.includes(String(v)))) return false
            } else if (!list.includes(String(value))) {
              return false
            }
            continue
          }
          case 'between': {
            // Value format is "from,to" — either side may be empty for an
            // open-ended bound.
            if (value == null) return false
            const raw = String(needle)
            const [fromStr = '', toStr = ''] = raw.split(',')
            const propType = entry.property?.type?.()
            if (propType === 'date' || propType === 'datetime') {
              const valStr = this.toIso(value)
              if (fromStr !== '' && !(valStr >= fromStr)) return false
              // Use prefix-tolerant upper bound so `to=2025-12-31` matches
              // rows timestamped within that day, not just at midnight.
              if (toStr !== '' && !(valStr <= toStr + 'Z')) return false
            } else {
              const num = Number(value)
              if (fromStr !== '' && !(num >= Number(fromStr))) return false
              if (toStr !== '' && !(num <= Number(toStr))) return false
            }
            continue
          }
        }
      }

      // Array fields (e.g. many-to-many tagIds): match when the needle equals
      // (or is contained in) any element. Strings do case-insensitive substring.
      if (Array.isArray(value)) {
        const items = value.map((v) => String(v).toLowerCase())
        const target = String(needle).toLowerCase()
        if (!items.some((i) => i.includes(target))) return false
        continue
      }
      if (typeof needle === 'string') {
        if (!String(value ?? '').toLowerCase().includes(needle.toLowerCase())) return false
      } else if (needle !== value) {
        return false
      }
    }
    return true
  }

  override async count(filter: Filter): Promise<number> {
    return this.table.rows.filter((r) => this.matches(r, filter)).length
  }

  override async find(filter: Filter, options: FindOptions): Promise<BaseRecord[]> {
    const filtered = this.table.rows.filter((r) => this.matches(r, filter))
    const sortBy = options.sort?.sortBy
    const direction = options.sort?.direction
    if (sortBy) {
      filtered.sort((a, b) => {
        const av = a[sortBy]
        const bv = b[sortBy]
        if (av === bv) return 0
        const cmp = (av as number | string) > (bv as number | string) ? 1 : -1
        return direction === 'desc' ? -cmp : cmp
      })
    }
    const offset = options.offset ?? 0
    const limit = options.limit ?? filtered.length
    return filtered.slice(offset, offset + limit).map((row) => new BaseRecord(row, this))
  }

  override async findOne(id: string): Promise<BaseRecord | null> {
    const row = this.table.rows.find((r) => r.id === id)
    return row ? new BaseRecord(row, this) : null
  }

  override async findMany(ids: Array<string | number>): Promise<BaseRecord[]> {
    const set = new Set(ids.map(String))
    return this.table.rows
      .filter((r) => set.has(String(r.id)))
      .map((row) => new BaseRecord(row, this))
  }

  override async create(params: ParamsType): Promise<ParamsType> {
    const row: InMemoryRow = {
      ...(params as InMemoryRow),
      id: String((params as InMemoryRow).id ?? this.table.rows.length + 1),
    }
    this.table.rows.push(row)
    return row
  }

  override async update(id: string, params: ParamsType): Promise<ParamsType> {
    const idx = this.table.rows.findIndex((r) => r.id === id)
    if (idx < 0) throw new Error(`Row "${id}" not found in "${this.table.name}"`)
    const next = { ...this.table.rows[idx], ...params, id } as InMemoryRow
    this.table.rows[idx] = next
    return next
  }

  override async delete(id: string): Promise<void> {
    const idx = this.table.rows.findIndex((r) => r.id === id)
    if (idx >= 0) this.table.rows.splice(idx, 1)
  }

  override supportsTimeSeries(): boolean {
    return true
  }

  /**
   * In-JS time-series aggregation: pull rows from the in-memory table,
   * bucket by `dateField` truncated to `step`, and group by an optional
   * second column. Mirrors the Prisma adapter's contract (special keys
   * `__total__` / `__other__` / `__null__`, top-N truncation, ISO date
   * bucket strings) so the analytics controller and chart widget render
   * the same shapes regardless of which backend serves the demo.
   */
  override async aggregateTimeSeries(
    filter: Filter,
    query: TimeSeriesQuery,
  ): Promise<TimeSeriesResult> {
    const series = this.runTimeSeries(filter, query)
    if (!query.comparePrevious) return { series }
    const span = query.to.getTime() - query.from.getTime()
    const prev = this.runTimeSeries(filter, {
      ...query,
      from: new Date(query.from.getTime() - span),
      to: new Date(query.from.getTime()),
    })
    return { series, previous: prev }
  }

  private runTimeSeries(filter: Filter, query: TimeSeriesQuery): TimeSeriesSeries[] {
    const fromTs = query.from.getTime()
    const toTs = query.to.getTime()
    const rows = this.table.rows.filter((row) => {
      if (!this.matches(row, filter)) return false
      const v = row[query.dateField]
      if (v == null) return false
      const d = v instanceof Date ? v : new Date(String(v))
      const ts = d.getTime()
      if (Number.isNaN(ts)) return false
      return ts >= fromTs && ts <= toTs
    })

    const fromIso = isoDate(query.from)
    const seriesMap = new Map<string, Map<string, { sum: number; count: number; min: number; max: number }>>()

    for (const row of rows) {
      const v = row[query.dateField]
      const d = v instanceof Date ? v : new Date(String(v))
      const bucketKey = query.step === 'all' ? fromIso : truncateDate(d, query.step)
      const seriesKey = query.groupBy ? stringifyKey(row[query.groupBy]) : '__total__'
      const numericVal = query.metric === 'count' ? 1 : toNumber(row[query.field as string])

      let inner = seriesMap.get(seriesKey)
      if (!inner) {
        inner = new Map()
        seriesMap.set(seriesKey, inner)
      }
      const entry = inner.get(bucketKey)
      if (!entry) {
        inner.set(bucketKey, { sum: numericVal, count: 1, min: numericVal, max: numericVal })
      } else {
        entry.sum += numericVal
        entry.count += 1
        if (numericVal < entry.min) entry.min = numericVal
        if (numericVal > entry.max) entry.max = numericVal
      }
    }

    const reduce = (e: { sum: number; count: number; min: number; max: number }): number => {
      switch (query.metric) {
        case 'count': return e.count
        case 'sum':   return e.sum
        case 'avg':   return e.count === 0 ? 0 : e.sum / e.count
        case 'min':   return e.min
        case 'max':   return e.max
      }
    }

    // Top-N truncation by total metric value (rolls overflow into __other__).
    const topN = query.topN ?? 10
    const totals = Array.from(seriesMap.entries()).map(([key, inner]) => {
      let total = 0
      for (const e of inner.values()) total += reduce(e)
      return [key, total] as const
    })
    totals.sort((a, b) => b[1] - a[1])
    const keep = new Set(totals.slice(0, topN).map(([k]) => k))
    const otherInner = new Map<string, { sum: number; count: number; min: number; max: number }>()
    for (const [key, inner] of seriesMap) {
      if (keep.has(key)) continue
      for (const [bucket, e] of inner) {
        const cur = otherInner.get(bucket)
        if (!cur) otherInner.set(bucket, { ...e })
        else {
          cur.sum += e.sum
          cur.count += e.count
          if (e.min < cur.min) cur.min = e.min
          if (e.max > cur.max) cur.max = e.max
        }
      }
      seriesMap.delete(key)
    }
    if (otherInner.size > 0) seriesMap.set('__other__', otherInner)

    const out: TimeSeriesSeries[] = []
    for (const [key, inner] of seriesMap) {
      const points = Array.from(inner.entries())
        .map(([date, e]) => ({ date, value: reduce(e) }))
        .sort((a, b) => a.date.localeCompare(b.date))
      out.push({ key, points })
    }
    return out
  }
}

// ─── Time-series helpers ─────────────────────────────────────────────────

const isoDate = (d: Date): string => d.toISOString().slice(0, 10)

const truncateDate = (d: Date, step: TimeSeriesStep): string => {
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  const day = d.getUTCDate()
  switch (step) {
    case 'day':
      return isoDate(new Date(Date.UTC(y, m, day)))
    case 'week': {
      // ISO week, Monday-based — matches the Prisma adapter.
      const dow = (d.getUTCDay() + 6) % 7
      return isoDate(new Date(Date.UTC(y, m, day - dow)))
    }
    case 'month':
      return isoDate(new Date(Date.UTC(y, m, 1)))
    case 'year':
      return isoDate(new Date(Date.UTC(y, 0, 1)))
    case 'all':
      return isoDate(d)
  }
}

const toNumber = (v: unknown): number => {
  if (typeof v === 'number') return v
  if (v == null) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const stringifyKey = (v: unknown): string => {
  if (v == null) return '__null__'
  if (typeof v === 'string') return v
  return String(v)
}
