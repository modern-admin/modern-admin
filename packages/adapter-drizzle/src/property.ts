import { BaseProperty, type PropertyType } from '@modern-admin/core'
import type { DrizzleColumn, DrizzleTable } from './types.js'

const DATA_TYPE_TO_PROPERTY: Readonly<Record<string, PropertyType>> = {
  string: 'string',
  number: 'number',
  bigint: 'number',
  boolean: 'boolean',
  date: 'datetime',
  json: 'json',
  buffer: 'string',
}

const isUuidColumn = (name: string, columnType?: string): boolean => {
  if (columnType && /uuid/i.test(columnType)) return true
  return /(^id$|Id$|_id$|uuid)/i.test(name)
}

/**
 * Property descriptor backed by a Drizzle column. Maps drizzle's runtime
 * dataType / columnType tags onto the core PropertyType taxonomy.
 */
export class DrizzleProperty extends BaseProperty {
  public readonly column: DrizzleColumn

  constructor(column: DrizzleColumn, reference: string | null = null, position = 1) {
    const isEnum = (column.enumValues?.length ?? 0) > 0
    const type = DrizzleProperty.resolveType(column, isEnum, reference !== null)
    super({
      path: column.name,
      type,
      isId: column.primary === true,
      isSortable: type !== 'json' && type !== 'mixed',
      isRequired:
        column.notNull === true && column.hasDefault !== true && column.primary !== true,
      position,
      reference,
      availableValues: isEnum ? Array.from(column.enumValues!) : null,
    })
    this.column = column
  }

  private static resolveType(
    column: DrizzleColumn,
    isEnum: boolean,
    isReference: boolean,
  ): PropertyType {
    if (isReference) return 'reference'
    if (isEnum) return 'enum'
    const mapped = DATA_TYPE_TO_PROPERTY[column.dataType]
    if (mapped) {
      if (mapped === 'string' && column.primary && isUuidColumn(column.name, column.columnType)) {
        return 'uuid'
      }
      return mapped
    }
    return 'mixed'
  }
}

/** Find the primary-key column in a drizzle table. Returns null when absent. */
export const findPrimaryColumn = (table: DrizzleTable): DrizzleColumn | null => {
  for (const key of Object.keys(table)) {
    if (key === '_') continue
    const col = table[key] as DrizzleColumn | undefined
    if (col && col.primary === true) return col
  }
  return null
}

const FK_SYMBOL_DESC = /InlineForeignKeys$/
const TABLE_NAME_SYMBOL_DESC = /BaseName$/

interface DrizzleFKShape {
  reference: () => {
    columns: Array<{ name: string }>
    foreignTable: object
  }
}

const tableBaseName = (table: object): string | null => {
  for (const sym of Object.getOwnPropertySymbols(table)) {
    if (TABLE_NAME_SYMBOL_DESC.test(sym.description ?? '')) {
      const v = (table as Record<symbol, unknown>)[sym]
      if (typeof v === 'string') return v
    }
  }
  return null
}

/**
 * Walk drizzle's hidden inline-FK symbol on a table and return a map of
 * local column name → foreign table base name. Returns an empty map when
 * the table has no FKs or when the structure differs (driver-specific).
 */
export const extractForeignKeys = (table: DrizzleTable): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const sym of Object.getOwnPropertySymbols(table)) {
    if (!FK_SYMBOL_DESC.test(sym.description ?? '')) continue
    const fks = (table as Record<symbol, unknown>)[sym]
    if (!Array.isArray(fks)) continue
    for (const fk of fks as DrizzleFKShape[]) {
      try {
        const ref = fk.reference()
        const targetName = tableBaseName(ref.foreignTable)
        if (!targetName) continue
        for (const c of ref.columns) {
          out[c.name] = targetName
        }
      } catch {
        // ignore malformed FKs — keep adapter resilient across drivers.
      }
    }
  }
  return out
}
