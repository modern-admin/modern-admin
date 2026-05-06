import { BaseDatabase } from '@modern-admin/core'
import { DrizzleResource } from './resource.js'
import type { DrizzleDatabaseConfig, DrizzleTable } from './types.js'

const isDrizzleDatabaseConfig = (db: unknown): db is DrizzleDatabaseConfig =>
  typeof db === 'object' &&
  db !== null &&
  'client' in db &&
  'schema' in db &&
  typeof (db as { schema?: object }).schema === 'object'

const looksLikeTable = (value: unknown): value is DrizzleTable => {
  if (!value || typeof value !== 'object') return false
  // Drizzle tables expose at least one column with `name` + `dataType`.
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (key === '_') continue
    const col = (value as Record<string, unknown>)[key]
    if (
      col &&
      typeof col === 'object' &&
      typeof (col as { name?: unknown }).name === 'string' &&
      typeof (col as { dataType?: unknown }).dataType === 'string'
    ) {
      return true
    }
  }
  return false
}

export class DrizzleDatabase extends BaseDatabase {
  public readonly config: DrizzleDatabaseConfig

  constructor(config: unknown) {
    super(config)
    if (!isDrizzleDatabaseConfig(config)) {
      throw new Error('DrizzleDatabase requires { client, schema } config')
    }
    this.config = config
  }

  static override isAdapterFor(db: unknown): boolean {
    return isDrizzleDatabaseConfig(db)
  }

  override resources(): DrizzleResource[] {
    const { client, schema, resources: overrides } = this.config
    const out: DrizzleResource[] = []
    for (const tableKey of Object.keys(schema)) {
      const table = schema[tableKey]
      if (!looksLikeTable(table)) continue
      const cfg = overrides?.[tableKey] ?? {}
      out.push(
        new DrizzleResource({
          client,
          schema,
          table,
          tableKey,
          ...cfg,
        }),
      )
    }
    return out
  }
}
