import { pgTable, text, integer, boolean, timestamp, pgEnum } from 'drizzle-orm/pg-core'
import type { DrizzleSchema, DrizzleTable } from '../../src/types.js'

export const userRole = pgEnum('user_role', ['admin', 'editor', 'viewer'])

const usersDef = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  name: text('name'),
  role: userRole('role').default('viewer').notNull(),
  age: integer('age'),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

const postsDef = pgTable('posts', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  body: text('body'),
  authorId: text('author_id')
    .notNull()
    .references(() => usersDef.id),
  published: boolean('published').default(false).notNull(),
})

// Re-export as duck-typed DrizzleTable since drizzle's PgTableWithColumns
// uses a typed mapped object (not Record<string, …>) which lacks a string
// index signature; the runtime shape matches DrizzleTable verbatim.
export const users = usersDef as unknown as DrizzleTable
export const posts = postsDef as unknown as DrizzleTable
export const schema: DrizzleSchema = { users, posts }
