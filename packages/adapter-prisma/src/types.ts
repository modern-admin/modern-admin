// Minimal structural types for the slice of Prisma we depend on. We do NOT
// import the user-generated PrismaClient type — adapters must remain
// schema-agnostic. The client is treated as a record of model delegates.

export interface PrismaModelDelegate {
  findMany(args?: unknown): Promise<unknown[]>
  findUnique(args: { where: Record<string, unknown> }): Promise<unknown | null>
  count(args?: { where?: Record<string, unknown> }): Promise<number>
  create(args: { data: Record<string, unknown> }): Promise<unknown>
  update(args: {
    where: Record<string, unknown>
    data: Record<string, unknown>
  }): Promise<unknown>
  delete(args: { where: Record<string, unknown> }): Promise<unknown>
  aggregate?(args: unknown): Promise<unknown>
  groupBy?(args: unknown): Promise<unknown[]>
}


export type PrismaClientLike = { [K: string]: any } & {
  $transaction?<T>(fn: (tx: PrismaClientLike) => Promise<T>): Promise<T>
}

/**
 * The subset of DMMF we read. Mirrors `@prisma/client/runtime`'s `DMMF.Model`
 * so a real DMMF object can be passed directly without conversion.
 */
export interface DmmfField {
  name: string
  kind: 'scalar' | 'object' | 'enum' | 'unsupported'
  type: string
  isList: boolean
  isRequired: boolean
  isUnique: boolean
  isId: boolean
  isReadOnly: boolean
  hasDefaultValue: boolean
  relationName?: string
  relationFromFields?: readonly string[]
  relationToFields?: readonly string[]
}

export interface DmmfModel {
  name: string
  dbName?: string | null
  fields: readonly DmmfField[]
  primaryKey?: { name: string | null; fields: readonly string[] } | null
  uniqueFields?: readonly (readonly string[])[]
  uniqueIndexes?: readonly { name: string | null; fields: readonly string[] }[]
}

export interface DmmfEnum {
  name: string
  values: readonly { name: string; dbName?: string | null }[]
}

export interface DmmfDatamodel {
  models: readonly DmmfModel[]
  enums?: readonly DmmfEnum[]
}

export interface DmmfDocument {
  datamodel: DmmfDatamodel
}

export interface PrismaResourceConfig {
  model: DmmfModel
  client: PrismaClientLike
  /** Optional enums for richer type info (mirrors `dmmf.datamodel.enums`). */
  enums?: readonly DmmfEnum[]
  /** Override the delegate key — defaults to `lowercaseFirst(model.name)`. */
  clientKey?: string
  /** Database dialect; only used to render display SQL. Defaults to `'pg'`. */
  dialect?: PrismaDialect
}

export type PrismaDialect = 'pg' | 'mysql' | 'sqlite'

export interface PrismaDatabaseConfig {
  client: PrismaClientLike
  dmmf: DmmfDocument
  /**
   * Database dialect. Used only to render the display SQL returned with
   * time-series results. Defaults to `'pg'` when omitted.
   */
  dialect?: PrismaDialect
}
