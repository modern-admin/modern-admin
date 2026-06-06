import { uuidv7, type ConfigEntry, type ConfigScope, type IConfigStore } from '@modern-admin/core'
import { and, asc, eq, isNull, type SQL } from 'drizzle-orm'
import type { DrizzleLike, SystemTables } from '../types.js'

interface ConfigRow {
  scope: string
  scopeId: string | null
  key: string
  value: unknown
  updatedAt: Date
}

const rowToEntry = (row: ConfigRow): ConfigEntry => ({
  scope: row.scope as ConfigScope,
  scopeId: row.scopeId,
  key: row.key,
  value: row.value,
  updatedAt: row.updatedAt.toISOString(),
})

export class DrizzleConfigStore implements IConfigStore {
  constructor(
    private readonly db: DrizzleLike,
    private readonly table: SystemTables['maConfig'],
  ) {}

  private pkCondition(scope: ConfigScope, scopeId: string | null, key: string): SQL {
    const scopeIdCond = scopeId === null
      ? isNull(this.table.scopeId)
      : eq(this.table.scopeId, scopeId)
    return and(eq(this.table.scope, scope), scopeIdCond, eq(this.table.key, key))!
  }

  async get(scope: ConfigScope, scopeId: string | null, key: string): Promise<unknown> {
    const rows = (await this.db
      .select()
      .from(this.table)
      .where(this.pkCondition(scope, scopeId, key))
      .limit(1)) as ConfigRow[]
    return rows[0]?.value
  }

  async set(
    scope: ConfigScope,
    scopeId: string | null,
    key: string,
    value: unknown,
  ): Promise<void> {
    await this.db
      .insert(this.table)
      .values({
        id: uuidv7(),
        scope,
        scopeId,
        key,
        value: value ?? null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [this.table.scope, this.table.scopeId, this.table.key],
        set: { value: value ?? null, updatedAt: new Date() },
      })
  }

  async delete(scope: ConfigScope, scopeId: string | null, key: string): Promise<void> {
    await this.db.delete(this.table).where(this.pkCondition(scope, scopeId, key))
  }

  async list(scope: ConfigScope, scopeId: string | null): Promise<ConfigEntry[]> {
    const scopeIdCond = scopeId === null
      ? isNull(this.table.scopeId)
      : eq(this.table.scopeId, scopeId)
    const rows = (await this.db
      .select()
      .from(this.table)
      .where(and(eq(this.table.scope, scope), scopeIdCond))
      .orderBy(asc(this.table.key))) as ConfigRow[]
    return rows.map(rowToEntry)
  }
}
