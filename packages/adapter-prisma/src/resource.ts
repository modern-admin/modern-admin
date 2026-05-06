import {
  BaseRecord,
  BaseResource,
  ValidationError,
  type Filter,
  type FindOptions,
  type ParamsType,
} from '@modern-admin/core'
import { PrismaProperty } from './property.js'
import { filterToWhere, findOptionsToPrisma } from './converters.js'
import type {
  DmmfEnum,
  DmmfField,
  DmmfModel,
  PrismaClientLike,
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

export class PrismaResource extends BaseResource {
  public readonly model: DmmfModel
  public readonly client: PrismaClientLike
  public readonly enums: readonly DmmfEnum[]
  public readonly clientKey: string
  private readonly _properties: PrismaProperty[]
  private readonly idField: DmmfField

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

    const idField = config.model.fields.find((f) => f.isId)
    if (!idField) {
      throw new Error(`Prisma model "${config.model.name}" has no @id field`)
    }
    this.idField = idField

    this._properties = config.model.fields.map(
      (field, index) => new PrismaProperty(field, this.enums, index + 1),
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
    return { [this.idField.name]: this.castId(id) }
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
      if (field.isReadOnly && !field.isId) continue
      if (field.name in params) out[field.name] = params[field.name]
    }
    return out
  }

  override async count(filter: Filter): Promise<number> {
    return this.delegate().count({ where: filterToWhere(filter) })
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
          fields.map((f) => [f, { type: 'unique', message: `${f} must be unique` }]),
        ),
      )
    }
    if (e.code === 'P2003' && e.meta?.field_name) {
      return new ValidationError({
        [e.meta.field_name]: { type: 'foreignKey', message: 'related record not found' },
      })
    }
    return err
  }
}
