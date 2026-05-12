// @modern-admin/adapter-drizzle — Drizzle ORM adapter for @modern-admin/core.
//
// Usage:
//   import { drizzle } from 'drizzle-orm/node-postgres'
//   import * as schema from './schema'
//   import { DrizzleDatabase, DrizzleResource } from '@modern-admin/adapter-drizzle'
//
//   const client = drizzle(pool, { schema })
//   const admin = new ModernAdmin({
//     databases: [{ client, schema }],
//     adapters: [{ Database: DrizzleDatabase, Resource: DrizzleResource }],
//   })

export { DrizzleDatabase } from './database.js'
export { DrizzleResource } from './resource.js'
export { DrizzleProperty, extractForeignKeys, findPrimaryColumn } from './property.js'
export { filterToWhere, findOptionsToDrizzle } from './converters.js'
export type {
  DrizzleClientLike,
  DrizzleColumn,
  DrizzleDatabaseConfig,
  DrizzleDeleteBuilder,
  DrizzleDialect,
  DrizzleInsertBuilder,
  DrizzleQueryBuilder,
  DrizzleResourceConfig,
  DrizzleSchema,
  DrizzleSelectBuilder,
  DrizzleTable,
  DrizzleUpdateBuilder,
} from './types.js'
