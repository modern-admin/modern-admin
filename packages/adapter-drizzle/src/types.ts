// Structural types matching the surface of `drizzle-orm` we depend on.
// Importing the real types breaks for consumers who use a different DB driver
// (pg, mysql, sqlite) since each has its own column/table classes — keeping
// this duck-typed lets the adapter work uniformly across drivers.

export interface DrizzleColumn {
  name: string
  /** drizzle's runtime data tag — 'string', 'number', 'boolean', 'date', 'json', 'bigint', 'buffer', 'array'. */
  dataType: string
  /** specific column kind such as 'PgUUID', 'PgEnum', 'PgText', 'PgArray'. Optional. */
  columnType?: string
  primary?: boolean
  notNull?: boolean
  hasDefault?: boolean
  enumValues?: readonly string[]
  /** For PgArray columns — points to the inner element column. */
  baseColumn?: DrizzleColumn
}

export type DrizzleTable = Record<string, DrizzleColumn> & {
  /** drizzle's hidden table metadata bag. */
  _?: { name?: string }
}

export interface DrizzleQueryBuilder<T> {
  where(condition: unknown): DrizzleQueryBuilder<T>
  orderBy(...columns: unknown[]): DrizzleQueryBuilder<T>
  groupBy(...columns: unknown[]): DrizzleQueryBuilder<T>
  limit(n: number): DrizzleQueryBuilder<T>
  offset(n: number): DrizzleQueryBuilder<T>
  // The library returns a thenable at the end of the chain.
  then<U>(onfulfilled?: (value: T[]) => U | PromiseLike<U>): Promise<U>
}

export interface DrizzleSelectBuilder {
  from(table: DrizzleTable): DrizzleQueryBuilder<Record<string, unknown>>
}

export interface DrizzleInsertBuilder {
  values(value: Record<string, unknown>): {
    returning(): Promise<Array<Record<string, unknown>>>
  }
}

export interface DrizzleUpdateBuilder {
  set(values: Record<string, unknown>): {
    where(condition: unknown): {
      returning(): Promise<Array<Record<string, unknown>>>
    }
  }
}

export interface DrizzleDeleteBuilder {
  where(condition: unknown): Promise<unknown>
}

export interface DrizzleClientLike {
  select(): DrizzleSelectBuilder
  select(fields: Record<string, unknown>): DrizzleSelectBuilder
  insert(table: DrizzleTable): DrizzleInsertBuilder
  update(table: DrizzleTable): DrizzleUpdateBuilder
  delete(table: DrizzleTable): DrizzleDeleteBuilder
  transaction?<T>(fn: (tx: DrizzleClientLike) => Promise<T>): Promise<T>
}

export interface DrizzleSchema {
  [tableName: string]: DrizzleTable
}

export type DrizzleDialect = 'pg' | 'mysql' | 'sqlite'

export interface DrizzleResourceConfig {
  /** Override the resource id (defaults to drizzle's table name). */
  id?: string
}

export interface DrizzleDatabaseConfig {
  /** drizzle client, e.g. `drizzle(pool, { schema })`. */
  client: DrizzleClientLike
  /** drizzle schema (object exporting tables). */
  schema: DrizzleSchema
  /**
   * Database dialect. Required to build dialect-specific SQL for
   * `aggregateTimeSeries` (DATE_TRUNC vs DATE_FORMAT vs strftime).
   * Defaults to `'pg'` when omitted.
   */
  dialect?: DrizzleDialect
  /** Optional per-table overrides. */
  resources?: Record<string, DrizzleResourceConfig>
}
