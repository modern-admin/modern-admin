import { AsyncLocalStorage } from 'node:async_hooks'
import {
  BaseRecord,
  BaseResource,
  buildDisplaySql,
  isoDate,
  stringifyKey,
  toNumber,
  truncateDate,
  DEFAULT_TIME_SERIES_ROW_CAP,
  type Filter,
  type FindOptions,
  type ParamsType,
  type TimeSeriesQuery,
  type TimeSeriesResult,
  type TimeSeriesSeries,
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

/**
 * Ambient transaction context. Module-level (not per-resource) on purpose:
 * inside `transaction(fn)` the callback often touches *other* resources
 * backed by the same Prisma client (e.g. the junction resource in an m2m
 * diff, every record in a bulk delete) — they must all see the tx client,
 * not the base one. `base` is stored alongside `tx` so a resource bound to
 * a *different* Prisma client never accidentally picks up a foreign
 * transaction: cross-client atomicity is impossible, so it falls back to
 * its own client.
 */
const txStorage = new AsyncLocalStorage<{ base: PrismaClientLike; tx: PrismaClientLike }>()

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
  public readonly timeSeriesRowCap: number
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
    this.timeSeriesRowCap =
      config.timeSeriesRowCap && config.timeSeriesRowCap > 0
        ? Math.floor(config.timeSeriesRowCap)
        : DEFAULT_TIME_SERIES_ROW_CAP

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

  /** Active client: the ambient transaction client when inside `transaction(fn)`. */
  private db(): PrismaClientLike {
    const store = txStorage.getStore()
    return store && store.base === this.client ? store.tx : this.client
  }

  private delegate(): PrismaModelDelegate {
    const delegate = this.db()[this.clientKey] as PrismaModelDelegate | undefined
    if (!delegate) {
      throw new Error(
        `Prisma client has no delegate for model "${this.model.name}" (key "${this.clientKey}")`,
      )
    }
    return delegate
  }

  private idClause(id: string | number): Record<string, unknown> {
    return { [this.idField.name]: this.castId(id) }
  }

  private castId(id: string | number): unknown {
    if (typeof id === 'number') return id
    // BigInt ids must round-trip through BigInt — Number() silently loses
    // precision above 2^53, so the lookup would target a neighbouring id.
    if (this.idField.type === 'BigInt') {
      try {
        return BigInt(id)
      } catch {
        return id
      }
    }
    if (this.idField.type === 'Int') {
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
      // Empty string on DateTime / enum columns is meaningless: the form
      // emits `""` when the user clears a control (Select placeholder,
      // legacy DatePicker), and Prisma 7 rejects it with a 500. Coerce to
      // `null` so optional columns are cleared, then let the required+null
      // gate below drop the key on required columns (so the DB @default
      // fires instead of erroring).
      const isEnumLike = field.kind === 'enum'
      const normalised =
        raw === '' && (field.type === 'DateTime' || isEnumLike) ? null : raw
      // Required (non-nullable) fields must not receive null — Prisma 7 treats
      // that as a validation error.  Omitting the key lets the DB @default fire
      // (e.g. enum defaults) or surfaces a clear "missing required field" error
      // instead of the unhelpful "must not be null" one.
      if (field.isRequired && normalised === null) continue
      // datetime-local inputs produce "YYYY-MM-DDTHH:mm" (no seconds / no tz).
      // Prisma 7 requires a complete ISO-8601 DateTime string, so we round-trip
      // through Date to normalise any partial string.  Invalid strings are
      // passed through unchanged so Prisma can surface the validation error.
      if (field.type === 'DateTime' && typeof normalised === 'string' && normalised !== '') {
        const d = new Date(normalised)
        out[field.name] = Number.isNaN(d.getTime()) ? normalised : d.toISOString()
      } else if (typeof normalised === 'string') {
        // Form-encoded payloads (`application/x-www-form-urlencoded`,
        // `multipart/form-data`, HTML `<form>` POSTs) stringify every
        // scalar. Prisma 7 strictly type-checks `Boolean`/`Int`/`Float`/
        // `Decimal`/`BigInt` columns and rejects strings with a generic
        // PrismaClientValidationError → 500. Coerce the common shapes so
        // the same payload that works for JSON also works for form posts.
        out[field.name] = coerceFormScalar(normalised, field.type)
      } else {
        out[field.name] = normalised
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
    if (isNullable) conditions.push({ [field]: { not: null } })
    if (options?.search) conditions.push({ [field]: { contains: options.search, mode: 'insensitive' } })
    const where: Record<string, unknown> =
      conditions.length === 0 ? {}
        : conditions.length === 1 ? conditions[0]!
          : { AND: conditions }

    const rows = (await this.delegate().findMany({
      where,
      select: { [field]: true },
      distinct: [field],
      orderBy: { [field]: 'asc' },
      take: limit,
    })) as Array<Record<string, unknown>>

    return rows
      .map((r) => r[field])
      .filter((v): v is string => typeof v === 'string' && v !== '')
  }

  override async count(filter: Filter): Promise<number> {
    try {
      return await this.delegate().count({ where: filterToWhere(filter) })
    } catch (err) {
      throw this.toValidationError(err)
    }
  }

  override async find(filter: Filter, options: FindOptions): Promise<BaseRecord[]> {
    try {
      const rows = (await this.delegate().findMany({
        where: filterToWhere(filter),
        ...findOptionsToPrisma(options),
      })) as ParamsType[]
      return rows.map((row) => new BaseRecord(row, this))
    } catch (err) {
      throw this.toValidationError(err)
    }
  }

  override async search(
    query: string,
    fields: string[],
    options?: { limit?: number },
  ): Promise<BaseRecord[]> {
    const limit = options?.limit ?? 50
    if (!query || fields.length === 0) return []
    // Restrict to String columns — Prisma rejects `contains` on Int/Bool/
    // DateTime with a validation error. Enum + relation fields are also
    // skipped; substring search on them is rarely what callers want.
    const stringFieldNames = new Set(
      this.model.fields
        .filter((f) => f.type === 'String' && f.kind === 'scalar')
        .map((f) => f.name),
    )
    const stringFields = fields.filter((f) => stringFieldNames.has(f))
    if (stringFields.length === 0) return []
    const contains = (field: string): Record<string, unknown> => ({
      [field]: { contains: query, mode: 'insensitive' },
    })
    const where =
      stringFields.length === 1
        ? contains(stringFields[0]!)
        : { OR: stringFields.map(contains) }
    try {
      const rows = (await this.delegate().findMany({
        where,
        take: limit,
      })) as ParamsType[]
      return rows.map((row) => new BaseRecord(row, this))
    } catch (err) {
      throw this.toValidationError(err)
    }
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
      where: { [this.idField.name]: { in: ids.map((id) => this.castId(id)) } },
    })) as ParamsType[]
    return rows.map((row) => new BaseRecord(row, this))
  }

  override async create(params: ParamsType): Promise<ParamsType> {
    try {
      return (await this.delegate().create({ data: this.writableData(params) })) as ParamsType
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
    await this.delegate().delete({ where: this.idClause(id) })
  }

  override async deleteMany(filter: Filter): Promise<number> {
    try {
      const { count } = (await this.delegate().deleteMany({
        where: filterToWhere(filter),
      })) as { count: number }
      return count
    } catch (err) {
      throw this.toValidationError(err)
    }
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
    let truncated = series.truncated
    if (query.comparePrevious) {
      const span = query.to.getTime() - query.from.getTime()
      const prevTo = new Date(query.from.getTime())
      const prevFrom = new Date(query.from.getTime() - span)
      const prev = await this.runTimeSeries(filter, { ...query, from: prevFrom, to: prevTo })
      previous = prev.series
      truncated = truncated || prev.truncated
    }
    return {
      series: series.series,
      ...(previous ? { previous } : {}),
      sql: series.sql,
      ...(truncated ? { truncated: true } : {}),
    }
  }

  /**
   * Pull rows in the date window via `findMany` and bucket in JS. Prisma's
   * typed client cannot `DATE_TRUNC`, so bucketing stays application-side.
   *
   * The scan is bounded by `timeSeriesRowCap` (fetch `cap + 1`, keep `cap`)
   * so an unexpectedly wide window can't load the whole table into memory.
   * Rows are ordered newest-first, so when the cap is hit the most recent
   * window is kept and `truncated` is flagged for the caller.
   */
  private async runTimeSeries(
    filter: Filter,
    query: TimeSeriesQuery,
  ): Promise<{ series: TimeSeriesSeries[]; sql: string; truncated: boolean }> {
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
      [query.dateField]: { gte: query.from, lte: query.to },
    }
    const select: Record<string, true> = { [query.dateField]: true }
    if (query.field) select[query.field] = true
    if (query.groupBy) select[query.groupBy] = true

    // Fetch one more than the cap so we can detect (and flag) truncation
    // without a second COUNT round-trip. Newest-first ordering keeps the
    // most recent window when the cap is exceeded.
    const cap = this.timeSeriesRowCap
    const fetched = (await this.delegate().findMany({
      where,
      select,
      orderBy: { [query.dateField]: 'desc' },
      take: cap + 1,
    })) as Array<Record<string, unknown>>
    const truncated = fetched.length > cap
    const rows = truncated ? fetched.slice(0, cap) : fetched

    const seriesMap = new Map<string, Map<string, { sum: number; count: number; min: number; max: number }>>()
    const fromIso = isoDate(query.from)

    for (const row of rows) {
      const dateVal = row[query.dateField]
      const date = dateVal instanceof Date ? dateVal : new Date(String(dateVal))
      if (Number.isNaN(date.getTime())) continue
      const bucketKey = query.step === 'all' ? fromIso : truncateDate(date, query.step)
      const seriesKey = query.groupBy ? stringifyKey(row[query.groupBy]) : '__total__'

      // SQL aggregates (SUM/AVG/MIN/MAX) ignore NULL rows — mirror that here
      // so avg/min don't get dragged toward 0 by nulls, matching the
      // SQL-side Drizzle adapter.
      const rawVal = query.metric === 'count' ? 1 : row[query.field as string]
      if (rawVal == null) continue
      const numericVal = query.metric === 'count' ? 1 : toNumber(rawVal)

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
          otherInner.set(bucket, { ...e })
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
        .map(([date, e]) => ({ date, value: reduce(e) }))
        .sort((a, b) => a.date.localeCompare(b.date))
      seriesOut.push({ key, points })
    }

    return {
      series: seriesOut,
      sql: buildDisplaySql(this.dialect, this.databaseName(), query, filter),
      truncated,
    }
  }

  override async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const active = txStorage.getStore()
    // Already inside a transaction on this client — join it (Prisma's
    // interactive transactions don't nest).
    if (active && active.base === this.client) return fn()
    if (typeof this.client.$transaction !== 'function') return fn()
    return this.client.$transaction((tx) =>
      txStorage.run({ base: this.client, tx }, fn),
    )
  }

  /**
   * Map Prisma's known error shapes onto a core ValidationError so the action
   * layer can render per-field messages. Unknown errors propagate as-is.
   */
  private toValidationError(err: unknown): unknown {
    if (!err || typeof err !== 'object') return err
    const e = err as {
      code?: string
      name?: string
      constructor?: { name?: string }
      meta?: { target?: string[]; field_name?: string; modelName?: string }
      message?: string
    }
    if (e.code === 'P2002' && Array.isArray(e.meta?.target)) {
      const fields = e.meta.target
      return new ValidationError(
        Object.fromEntries(
          fields.map((f) => [f, { type: 'unique', message: `${f} must be unique` }]),
        ),
      )
    }
    if (e.code === 'P2003' && e.meta?.field_name) {
      return new ValidationError({
        [e.meta.field_name]: { type: 'foreignKey', message: 'related record not found' },
      })
    }
    // `PrismaClientValidationError` covers missing required arguments and
    // type mismatches. Surface as a field-level ValidationError so the
    // controller layer returns 400 instead of leaking a 500 stack trace.
    const name = e.name ?? e.constructor?.name
    if (name === 'PrismaClientValidationError' && typeof e.message === 'string') {
      const message = e.message
      // Match `Argument \`field\` is missing.` (Prisma 7 message format).
      const missing = message.match(/Argument `([^`]+)` is missing\./)
      if (missing?.[1]) {
        return new ValidationError({
          [missing[1]]: { type: 'required', message: `${missing[1]} is required` },
        })
      }
      // `Argument \`field\`: Invalid value provided.` covers type mismatches.
      const invalid = message.match(/Argument `([^`]+)`:\s*([^\n]+)/)
      if (invalid?.[1]) {
        return new ValidationError({
          [invalid[1]]: { type: 'invalid', message: invalid[2]?.trim() ?? 'invalid value' },
        })
      }
      // Generic fallback so the user still gets a 400 with a hint.
      return new ValidationError({}, { type: 'validation', message: message.split('\n').slice(-2).join(' ').trim() })
    }
    return err
  }
}

/**
 * Coerce a stringified scalar back to its declared Prisma type. Required
 * because form-encoded payloads (`multipart/form-data`, urlencoded HTML
 * forms) round-trip every value as a string; Prisma 7's strict type
 * checker then rejects the create with a `PrismaClientValidationError`
 * (e.g. `inStock: "true"` instead of `inStock: true`). Invalid strings
 * pass through unchanged so Prisma can still surface a precise error.
 */
const coerceFormScalar = (value: string, prismaType: string): unknown => {
  switch (prismaType) {
  case 'Boolean': {
    if (value === 'true' || value === '1' || value === 'on') return true
    if (value === 'false' || value === '0' || value === 'off') return false
    return value
  }
  case 'Int':
  case 'BigInt': {
    if (value === '') return value
    const n = Number(value)
    if (!Number.isFinite(n) || !Number.isInteger(n)) return value
    return prismaType === 'BigInt' ? BigInt(value) : n
  }
  case 'Float':
  case 'Decimal': {
    if (value === '') return value
    const n = Number(value)
    return Number.isFinite(n) ? n : value
  }
  default:
    return value
  }
}

