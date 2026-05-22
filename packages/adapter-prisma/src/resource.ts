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
  ValidationError,
} from '@modern-admin/core'
import { PrismaProperty } from './property.js'
import { filterToWhere, findOptionsToPrisma } from './converters.js'
import type {
  DmmfEnum,
  DmmfField,
  DmmfModel,
  PrismaClientLike,
  PrismaDialect,
  PrismaModelDelegate,
  PrismaResourceConfig,
} from './types.js'

const lowerFirst = (s: string): string => (s.length ? s[0]!.toLowerCase() + s.slice(1) : s)

const isPrismaResourceConfig = (raw: unknown): raw is PrismaResourceConfig =>
  typeof raw === 'object' &&
  raw !== null &&
  'model' in raw &&
  'client' in raw &&
  typeof (raw as { model?: { fields?: unknown } }).model?.fields === 'object'

const buildForeignKeyReferenceMap = (model: DmmfModel): Record<string, string> => {
  const map: Record<string, string> = {}
  for (const field of model.fields) {
    if (field.kind !== 'object') continue
    for (const fk of field.relationFromFields ?? []) {
      map[fk] = field.type
    }
  }
  return map
}

export class PrismaResource extends BaseResource {
  public readonly model: DmmfModel
  public readonly client: PrismaClientLike
  public readonly enums: readonly DmmfEnum[]
  public readonly clientKey: string
  public readonly dialect: PrismaDialect
  private readonly _properties: PrismaProperty[]
  private readonly idField: DmmfField
  private readonly writableForeignKeys: Set<string>

  constructor(rawConfig: unknown) {
    super()
    if (!isPrismaResourceConfig(rawConfig)) {
      throw new Error('PrismaResource requires { model, client } config')
    }
    const config = rawConfig
    this.model = config.model
    this.client = config.client
    this.enums = config.enums ?? []
    this.clientKey = config.clientKey ?? lowerFirst(config.model.name)
    this.dialect = config.dialect ?? 'pg'

    const idField = config.model.fields.find((f) => f.isId)
    if (!idField) {
      throw new Error(`Prisma model "${config.model.name}" has no @id field`)
    }
    this.idField = idField

    const foreignKeyReferences = buildForeignKeyReferenceMap(config.model)
    this.writableForeignKeys = new Set(Object.keys(foreignKeyReferences))
    this._properties = config.model.fields.map(
      (field, index) => new PrismaProperty(field, this.enums, index + 1, foreignKeyReferences[field.name] ?? null),
    )
  }

  static override isAdapterFor(raw: unknown): boolean {
    return isPrismaResourceConfig(raw)
  }

  override id(): string {
    return this.model.name
  }

  override databaseName(): string {
    return this.model.dbName ?? this.model.name
  }

  override databaseType(): string {
    return 'prisma'
  }

  override properties(): PrismaProperty[] {
    return this._properties
  }

  /** Look up by dotted path; for relations fall back to the FK field. */
  override property(path: string): PrismaProperty | null {
    return this._properties.find((p) => p.path() === path) ?? null
  }

  private delegate(): PrismaModelDelegate {
    const delegate = this.client[this.clientKey] as PrismaModelDelegate | undefined
    if (!delegate) {
      throw new Error(
        `Prisma client has no delegate for model "${this.model.name}" (key "${this.clientKey}")`,
      )
    }
    return delegate
  }

  private idClause(id: string | number): Record<string, unknown> {
    return {[this.idField.name]: this.castId(id)}
  }

  private castId(id: string | number): unknown {
    if (typeof id === 'number') return id
    if (this.idField.type === 'Int' || this.idField.type === 'BigInt') {
      const n = Number(id)
      return Number.isFinite(n) ? n : id
    }
    return id
  }

  /**
   * Strip relations and read-only computed fields; relations need explicit
   * `connect` semantics in Prisma which the action layer should opt into.
   */
  private writableData(params: ParamsType): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const field of this.model.fields) {
      if (field.kind === 'object') continue
      if (field.isReadOnly && !field.isId && !this.writableForeignKeys.has(field.name)) continue
      if (!(field.name in params)) continue
      const raw = params[field.name]
      // Required (non-nullable) fields must not receive null — Prisma 7 treats
      // that as a validation error.  Omitting the key lets the DB @default fire
      // (e.g. enum defaults) or surfaces a clear "missing required field" error
      // instead of the unhelpful "must not be null" one.
      if (field.isRequired && raw === null) continue
      // datetime-local inputs produce "YYYY-MM-DDTHH:mm" (no seconds / no tz).
      // Prisma 7 requires a complete ISO-8601 DateTime string, so we round-trip
      // through Date to normalise any partial string.  Invalid strings are
      // passed through unchanged so Prisma can surface the validation error.
      if (field.type === 'DateTime' && typeof raw === 'string' && raw !== '') {
        const d = new Date(raw)
        out[field.name] = Number.isNaN(d.getTime()) ? raw : d.toISOString()
      } else {
        out[field.name] = raw
      }
    }
    return out
  }

  override async distinct(
    field: string,
    options?: { limit?: number; search?: string },
  ): Promise<string[]> {
    const modelField = this.model.fields.find((f) => f.name === field)
    if (!modelField) return []
    // Only string-like fields make sense for distinct value pickers.
    if (modelField.type !== 'String' && modelField.kind !== 'enum') return []

    const limit = options?.limit ?? 100
    // Prisma 7: `not: null` is only valid for nullable (optional) fields.
    // Never mix `contains` + `not: null` in the same filter object — use AND.
    const isNullable = !modelField.isRequired
    const conditions: Record<string, unknown>[] = []
    if (isNullable) conditions.push({[field]: {not: null}})
    if (options?.search) conditions.push({[field]: {contains: options.search, mode: 'insensitive'}})
    const where: Record<string, unknown> =
      conditions.length === 0 ? {}
      : conditions.length === 1 ? conditions[0]!
      : {AND: conditions}

    const rows = (await this.delegate().findMany({
      where,
      select: {[field]: true},
      distinct: [field],
      orderBy: {[field]: 'asc'},
      take: limit,
    })) as Array<Record<string, unknown>>

    return rows
      .map((r) => r[field])
      .filter((v): v is string => typeof v === 'string' && v !== '')
  }

  override async count(filter: Filter): Promise<number> {
    return this.delegate().count({where: filterToWhere(filter)})
  }

  override async find(filter: Filter, options: FindOptions): Promise<BaseRecord[]> {
    const rows = (await this.delegate().findMany({
      where: filterToWhere(filter),
      ...findOptionsToPrisma(options),
    })) as ParamsType[]
    return rows.map((row) => new BaseRecord(row, this))
  }

  override async findOne(id: string): Promise<BaseRecord | null> {
    const row = (await this.delegate().findUnique({
      where: this.idClause(id),
    })) as ParamsType | null
    return row ? new BaseRecord(row, this) : null
  }

  override async findMany(ids: Array<string | number>): Promise<BaseRecord[]> {
    if (ids.length === 0) return []
    const rows = (await this.delegate().findMany({
      where: {[this.idField.name]: {in: ids.map((id) => this.castId(id))}},
    })) as ParamsType[]
    return rows.map((row) => new BaseRecord(row, this))
  }

  override async create(params: ParamsType): Promise<ParamsType> {
    try {
      return (await this.delegate().create({data: this.writableData(params)})) as ParamsType
    } catch (err) {
      throw this.toValidationError(err)
    }
  }

  override async update(id: string, params: ParamsType): Promise<ParamsType> {
    try {
      return (await this.delegate().update({
        where: this.idClause(id),
        data: this.writableData(params),
      })) as ParamsType
    } catch (err) {
      throw this.toValidationError(err)
    }
  }

  override async delete(id: string): Promise<void> {
    await this.delegate().delete({where: this.idClause(id)})
  }

  override supportsTimeSeries(): boolean {
    return true
  }

  override async aggregateTimeSeries(
    filter: Filter,
    query: TimeSeriesQuery,
  ): Promise<TimeSeriesResult> {
    const series = await this.runTimeSeries(filter, query)
    let previous: TimeSeriesSeries[] | undefined
    if (query.comparePrevious) {
      const span = query.to.getTime() - query.from.getTime()
      const prevTo = new Date(query.from.getTime())
      const prevFrom = new Date(query.from.getTime() - span)
      previous = (
        await this.runTimeSeries(filter, {...query, from: prevFrom, to: prevTo})
      ).series
    }
    return {
      series: series.series,
      ...(previous ? {previous} : {}),
      sql: series.sql,
    }
  }

  /**
   * Pull rows in the date window via `findMany` and bucket in JS. Avoids
   * dialect-specific raw SQL for the MVP. Caller-side limit of ~10k rows
   * is acceptable until a push-down `aggregate()` path lands.
   */
  private async runTimeSeries(
    filter: Filter,
    query: TimeSeriesQuery,
  ): Promise<{ series: TimeSeriesSeries[]; sql: string }> {
    const dateField = this.model.fields.find((f) => f.name === query.dateField)
    if (!dateField) {
      throw new Error(
        `aggregateTimeSeries: dateField "${query.dateField}" not found on model "${this.model.name}"`,
      )
    }
    if (query.metric !== 'count') {
      if (!query.field) {
        throw new Error(`aggregateTimeSeries: metric "${query.metric}" requires "field"`)
      }
      const f = this.model.fields.find((x) => x.name === query.field)
      if (!f) throw new Error(`aggregateTimeSeries: field "${query.field}" not found`)
    }
    if (query.groupBy) {
      const f = this.model.fields.find((x) => x.name === query.groupBy)
      if (!f) throw new Error(`aggregateTimeSeries: groupBy "${query.groupBy}" not found`)
    }

    const baseWhere = filterToWhere(filter)
    const where: Record<string, unknown> = {
      ...baseWhere,
      [query.dateField]: {gte: query.from, lte: query.to},
    }
    const select: Record<string, true> = {[query.dateField]: true}
    if (query.field) select[query.field] = true
    if (query.groupBy) select[query.groupBy] = true

    const rows = (await this.delegate().findMany({
      where,
      select,
    })) as Array<Record<string, unknown>>

    const seriesMap = new Map<string, Map<string, { sum: number; count: number; min: number; max: number }>>()
    const fromIso = isoDate(query.from)

    for (const row of rows) {
      const dateVal = row[query.dateField]
      const date = dateVal instanceof Date ? dateVal : new Date(String(dateVal))
      if (Number.isNaN(date.getTime())) continue
      const bucketKey = query.step === 'all' ? fromIso : truncateDate(date, query.step)
      const seriesKey = query.groupBy ? stringifyKey(row[query.groupBy]) : '__total__'

      const numericVal = query.metric === 'count' ? 1 : toNumber(row[query.field as string])

      let inner = seriesMap.get(seriesKey)
      if (!inner) {
        inner = new Map()
        seriesMap.set(seriesKey, inner)
      }
      const entry = inner.get(bucketKey)
      if (!entry) {
        inner.set(bucketKey, {
          sum: numericVal,
          count: 1,
          min: numericVal,
          max: numericVal,
        })
      } else {
        entry.sum += numericVal
        entry.count += 1
        if (numericVal < entry.min) entry.min = numericVal
        if (numericVal > entry.max) entry.max = numericVal
      }
    }

    // Reduce per-bucket entry to scalar based on metric.
    const reduce = (
      e: { sum: number; count: number; min: number; max: number },
    ): number => {
      switch (query.metric) {
        case 'count':
          return e.count
        case 'sum':
          return e.sum
        case 'avg':
          return e.count === 0 ? 0 : e.sum / e.count
        case 'min':
          return e.min
        case 'max':
          return e.max
      }
    }

    // Top-N truncation by total metric value.
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
        if (!cur) {
          otherInner.set(bucket, {...e})
        } else {
          cur.sum += e.sum
          cur.count += e.count
          if (e.min < cur.min) cur.min = e.min
          if (e.max > cur.max) cur.max = e.max
        }
      }
      seriesMap.delete(key)
    }
    if (otherInner.size > 0) seriesMap.set('__other__', otherInner)

    const seriesOut: TimeSeriesSeries[] = []
    for (const [key, inner] of seriesMap) {
      const points = Array.from(inner.entries())
        .map(([date, e]) => ({date, value: reduce(e)}))
        .sort((a, b) => a.date.localeCompare(b.date))
      seriesOut.push({key, points})
    }

    return {
      series: seriesOut,
      sql: buildPrismaDisplaySql(this.dialect, this.databaseName(), query, filter),
    }
  }

  override async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (typeof this.client.$transaction !== 'function') return fn()
    return this.client.$transaction(async () => fn())
  }

  /**
   * Map Prisma's known error shapes onto a core ValidationError so the action
   * layer can render per-field messages. Unknown errors propagate as-is.
   */
  private toValidationError(err: unknown): unknown {
    if (!err || typeof err !== 'object') return err
    const e = err as { code?: string; meta?: { target?: string[]; field_name?: string }; message?: string }
    if (e.code === 'P2002' && Array.isArray(e.meta?.target)) {
      const fields = e.meta.target
      return new ValidationError(
        Object.fromEntries(
          fields.map((f) => [f, {type: 'unique', message: `${f} must be unique`}]),
        ),
      )
    }
    if (e.code === 'P2003' && e.meta?.field_name) {
      return new ValidationError({
        [e.meta.field_name]: {type: 'foreignKey', message: 'related record not found'},
      })
    }
    return err
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

const buildPrismaDisplaySql = (
  dialect: PrismaDialect,
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
