import { and, asc, count as countFn, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import {
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
import { DrizzleProperty, extractForeignKeys, findPrimaryColumn } from './property.js'
import { filterToWhere, findOptionsToDrizzle } from './converters.js'
import type {
  DrizzleClientLike,
  DrizzleColumn,
  DrizzleDialect,
  DrizzleResourceConfig,
  DrizzleTable,
} from './types.js'

interface DrizzleResourceInit extends DrizzleResourceConfig {
  client: DrizzleClientLike
  table: DrizzleTable
  tableKey: string
  dialect: DrizzleDialect
}

const isInit = (raw: unknown): raw is DrizzleResourceInit =>
  typeof raw === 'object' &&
  raw !== null &&
  'client' in raw &&
  'table' in raw &&
  typeof (raw as { table?: object }).table === 'object'

export class DrizzleResource extends BaseResource {
  public readonly client: DrizzleClientLike
  public readonly table: DrizzleTable
  public readonly tableKey: string
  public readonly dialect: DrizzleDialect
  private readonly _id: string
  private readonly _properties: DrizzleProperty[]
  private readonly idColumn: DrizzleColumn

  constructor(raw: unknown) {
    super()
    if (!isInit(raw)) {
      throw new Error('DrizzleResource requires { client, table, tableKey } config')
    }
    this.client = raw.client
    this.table = raw.table
    this.tableKey = raw.tableKey
    this.dialect = raw.dialect ?? 'pg'
    this._id = raw.id ?? raw.table._?.name ?? raw.tableKey

    const idColumn = findPrimaryColumn(raw.table)
    if (!idColumn) {
      throw new Error(`Drizzle table "${this._id}" has no primary-key column`)
    }
    this.idColumn = idColumn

    const fks = extractForeignKeys(raw.table)
    let position = 1
    this._properties = []
    for (const key of Object.keys(raw.table)) {
      if (key === '_') continue
      const col = raw.table[key] as DrizzleColumn | undefined
      if (!col || typeof col.name !== 'string') continue
      this._properties.push(new DrizzleProperty(col, fks[col.name] ?? null, position++))
    }
  }

  static override isAdapterFor(raw: unknown): boolean {
    return isInit(raw)
  }

  override id(): string {
    return this._id
  }

  override databaseName(): string {
    return this.table._?.name ?? this._id
  }

  override databaseType(): string {
    return 'drizzle'
  }

  override properties(): DrizzleProperty[] {
    return this._properties
  }

  override property(path: string): DrizzleProperty | null {
    return this._properties.find((p) => p.path() === path) ?? null
  }

  private castId(id: string | number): unknown {
    if (typeof id === 'number') return id
    if (this.idColumn.dataType === 'number' || this.idColumn.dataType === 'bigint') {
      const n = Number(id)
      return Number.isFinite(n) ? n : id
    }
    return id
  }

  /** Drop unknown keys so we never write to columns that don't exist. */
  private writableData(params: ParamsType): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const prop of this._properties) {
      const path = prop.path()
      if (path in params) out[path] = params[path]
    }
    return out
  }

  override async count(filter: Filter): Promise<number> {
    const where = filterToWhere(filter, this.table)
    let qb = this.client.select({ value: countFn() }).from(this.table)
    if (where !== undefined) qb = qb.where(where)
    const rows = (await qb) as Array<{ value: number | string }>
    const v = rows[0]?.value ?? 0
    return typeof v === 'number' ? v : Number(v)
  }

  override async find(filter: Filter, options: FindOptions): Promise<BaseRecord[]> {
    const where = filterToWhere(filter, this.table)
    const { limit, offset, orderBy } = findOptionsToDrizzle(options, this.table)
    let qb = this.client.select().from(this.table)
    if (where !== undefined) qb = qb.where(where)
    if (orderBy !== undefined) qb = qb.orderBy(orderBy)
    if (limit !== undefined) qb = qb.limit(limit)
    if (offset !== undefined) qb = qb.offset(offset)
    const rows = (await qb) as ParamsType[]
    return rows.map((row) => new BaseRecord(row, this))
  }

  override async findOne(id: string): Promise<BaseRecord | null> {
    const rows = (await this.client
      .select()
      .from(this.table)
      .where(eq(this.idColumn as never, this.castId(id) as never))
      .limit(1)) as ParamsType[]
    const row = rows[0]
    return row ? new BaseRecord(row, this) : null
  }

  override async findMany(ids: Array<string | number>): Promise<BaseRecord[]> {
    if (ids.length === 0) return []
    const cast = ids.map((id) => this.castId(id))
    const rows = (await this.client
      .select()
      .from(this.table)
      .where(inArray(this.idColumn as never, cast as never))) as ParamsType[]
    return rows.map((row) => new BaseRecord(row, this))
  }

  override async create(params: ParamsType): Promise<ParamsType> {
    const rows = await this.client
      .insert(this.table)
      .values(this.writableData(params))
      .returning()
    return (rows[0] ?? {}) as ParamsType
  }

  override async update(id: string, params: ParamsType): Promise<ParamsType> {
    const rows = await this.client
      .update(this.table)
      .set(this.writableData(params))
      .where(eq(this.idColumn as never, this.castId(id) as never))
      .returning()
    return (rows[0] ?? {}) as ParamsType
  }

  override async delete(id: string): Promise<void> {
    await this.client
      .delete(this.table)
      .where(eq(this.idColumn as never, this.castId(id) as never))
  }

  override supportsTimeSeries(): boolean {
    return true
  }

  override async aggregateTimeSeries(
    filter: Filter,
    query: TimeSeriesQuery,
  ): Promise<TimeSeriesResult> {
    const series = await this.runTimeSeriesQuery(filter, query)
    let previous: TimeSeriesSeries[] | undefined
    if (query.comparePrevious) {
      const span = query.to.getTime() - query.from.getTime()
      const prevTo = new Date(query.from.getTime())
      const prevFrom = new Date(query.from.getTime() - span)
      previous = (
        await this.runTimeSeriesQuery(filter, { ...query, from: prevFrom, to: prevTo })
      ).series
    }
    return {
      series: series.series,
      ...(previous ? { previous } : {}),
      sql: series.sql,
    }
  }

  private async runTimeSeriesQuery(
    filter: Filter,
    query: TimeSeriesQuery,
  ): Promise<{ series: TimeSeriesSeries[]; sql: string }> {
    const dateCol = this.table[query.dateField] as DrizzleColumn | undefined
    if (!dateCol) {
      throw new Error(
        `aggregateTimeSeries: dateField "${query.dateField}" not found on resource "${this._id}"`,
      )
    }
    let fieldCol: DrizzleColumn | undefined
    if (query.metric !== 'count') {
      if (!query.field) {
        throw new Error(`aggregateTimeSeries: metric "${query.metric}" requires "field"`)
      }
      fieldCol = this.table[query.field] as DrizzleColumn | undefined
      if (!fieldCol) {
        throw new Error(`aggregateTimeSeries: field "${query.field}" not found`)
      }
    }
    let groupCol: DrizzleColumn | undefined
    if (query.groupBy) {
      groupCol = this.table[query.groupBy] as DrizzleColumn | undefined
      if (!groupCol) {
        throw new Error(`aggregateTimeSeries: groupBy "${query.groupBy}" not found`)
      }
    }

    const bucketSql = bucketExpr(this.dialect, query.step, dateCol)
    const metricSql = metricExpr(query.metric, fieldCol)

    // WHERE = date range + user filters.
    const conds: unknown[] = [
      gte(dateCol as never, query.from as never),
      lte(dateCol as never, query.to as never),
    ]
    const filterWhere = filterToWhere(filter, this.table)
    if (filterWhere !== undefined) conds.push(filterWhere)
    const where = conds.length === 1 ? conds[0] : and(...(conds as never[]))

    type Row = { bucket?: unknown; value: unknown; series_key?: unknown }
    const select: Record<string, unknown> = { value: metricSql }
    if (query.step !== 'all') select.bucket = bucketSql
    if (groupCol) select.series_key = groupCol

    let qb = this.client.select(select).from(this.table).where(where as unknown)
    const groupKeys: unknown[] = []
    if (query.step !== 'all') groupKeys.push(bucketSql)
    if (groupCol) groupKeys.push(groupCol)
    if (groupKeys.length) qb = qb.groupBy(...groupKeys)
    if (query.step !== 'all') qb = qb.orderBy(asc(bucketSql as never))

    const rows = (await qb) as Row[]

    // Bucket → series_key → numeric value.
    const fromIso = isoDate(query.from)
    const seriesMap = new Map<string, Map<string, number>>()
    for (const row of rows) {
      const seriesKey = groupCol ? stringifyKey(row.series_key) : '__total__'
      const bucketKey =
        query.step === 'all' ? fromIso : isoDate(toDate(row.bucket))
      const num = toNumber(row.value)
      let inner = seriesMap.get(seriesKey)
      if (!inner) {
        inner = new Map()
        seriesMap.set(seriesKey, inner)
      }
      inner.set(bucketKey, num)
    }

    // Top-N truncation: rank series by total, keep top N, collapse rest into '__other__'.
    const topN = query.topN ?? 10
    const totals = Array.from(seriesMap.entries()).map(
      ([k, m]) => [k, sumValues(m)] as const,
    )
    totals.sort((a, b) => b[1] - a[1])
    const keep = new Set(totals.slice(0, topN).map(([k]) => k))
    const otherInner = new Map<string, number>()
    for (const [key, inner] of seriesMap) {
      if (keep.has(key)) continue
      for (const [bucket, val] of inner) {
        otherInner.set(bucket, (otherInner.get(bucket) ?? 0) + val)
      }
      seriesMap.delete(key)
    }
    if (otherInner.size > 0) {
      seriesMap.set('__other__', otherInner)
    }

    const seriesOut: TimeSeriesSeries[] = []
    for (const [key, inner] of seriesMap) {
      const points = Array.from(inner.entries())
        .map(([date, value]) => ({ date, value }))
        .sort((a, b) => a.date.localeCompare(b.date))
      seriesOut.push({ key, points })
    }

    return {
      series: seriesOut,
      sql: buildDisplaySql(this.dialect, this.databaseName(), query, filter),
    }
  }

  override async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (typeof this.client.transaction !== 'function') return fn()
    return this.client.transaction(async () => fn())
  }
}

// ─── Time-series helpers ─────────────────────────────────────────────────

const bucketExpr = (
  dialect: DrizzleDialect,
  step: TimeSeriesStep,
  dateCol: DrizzleColumn,
): unknown => {
  if (step === 'all') return sql`MIN(${dateCol})`
  if (dialect === 'pg') {
    return sql`DATE_TRUNC(${step}, ${dateCol})`
  }
  if (dialect === 'mysql') {
    const fmt =
      step === 'day'
        ? '%Y-%m-%d'
        : step === 'week'
        ? '%x-W%v'
        : step === 'month'
        ? '%Y-%m-01'
        : '%Y-01-01'
    return sql`DATE_FORMAT(${dateCol}, ${fmt})`
  }
  // sqlite
  const fmt =
    step === 'day'
      ? '%Y-%m-%d'
      : step === 'week'
      ? '%Y-W%W'
      : step === 'month'
      ? '%Y-%m-01'
      : '%Y-01-01'
  return sql`STRFTIME(${fmt}, ${dateCol})`
}

const metricExpr = (
  op: TimeSeriesQuery['metric'],
  fieldCol: DrizzleColumn | undefined,
): unknown => {
  if (op === 'count') return sql`COUNT(*)`
  if (!fieldCol) {
    throw new Error(`metric "${op}" requires field`)
  }
  switch (op) {
    case 'sum':
      return sql`SUM(${fieldCol})`
    case 'avg':
      return sql`AVG(${fieldCol})`
    case 'min':
      return sql`MIN(${fieldCol})`
    case 'max':
      return sql`MAX(${fieldCol})`
  }
}

const isoDate = (d: Date): string => d.toISOString().slice(0, 10)

const toDate = (v: unknown): Date => {
  if (v instanceof Date) return v
  if (typeof v === 'string' || typeof v === 'number') return new Date(v)
  return new Date(String(v))
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

const sumValues = (m: Map<string, number>): number => {
  let s = 0
  for (const v of m.values()) s += v
  return s
}

const buildDisplaySql = (
  dialect: DrizzleDialect,
  tableName: string,
  query: TimeSeriesQuery,
  filter: Filter,
): string => {
  const ident = (s: string) => (dialect === 'mysql' ? `\`${s}\`` : `"${s}"`)
  const t = ident(tableName)
  const dateCol = ident(query.dateField)
  const bucket =
    query.step === 'all'
      ? `MIN(${dateCol})`
      : dialect === 'pg'
      ? `DATE_TRUNC('${query.step}', ${dateCol})`
      : dialect === 'mysql'
      ? `DATE_FORMAT(${dateCol}, ${mysqlFmt(query.step)})`
      : `STRFTIME(${sqliteFmt(query.step)}, ${dateCol})`
  const metric =
    query.metric === 'count'
      ? 'COUNT(*)'
      : `${query.metric.toUpperCase()}(${ident(query.field as string)})`
  const cols: string[] = []
  if (query.step !== 'all') cols.push(`${bucket} AS bucket`)
  cols.push(`${metric} AS value`)
  if (query.groupBy) cols.push(`${ident(query.groupBy)} AS series_key`)

  const where: string[] = [
    `${dateCol} >= '${query.from.toISOString()}'`,
    `${dateCol} <= '${query.to.toISOString()}'`,
  ]
  filter.reduce<null>((_, el) => {
    where.push(`${ident(el.path)} = '${String(el.value)}'`)
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

const mysqlFmt = (step: TimeSeriesStep): string =>
  step === 'day'
    ? "'%Y-%m-%d'"
    : step === 'week'
    ? "'%x-W%v'"
    : step === 'month'
    ? "'%Y-%m-01'"
    : "'%Y-01-01'"

const sqliteFmt = (step: TimeSeriesStep): string =>
  step === 'day'
    ? "'%Y-%m-%d'"
    : step === 'week'
    ? "'%Y-W%W'"
    : step === 'month'
    ? "'%Y-%m-01'"
    : "'%Y-01-01'"
