---
title: Drizzle adapter
description: Connect Drizzle 0.45 to Modern Admin — setup, type mapping, FK detection, array columns, and filter operators.
---

# Drizzle adapter

`@modern-admin/adapter-drizzle` walks your Drizzle schema at startup and exposes every
table as an admin resource without any codegen or DMMF equivalent.

---

## Installation

```sh
bun add @modern-admin/adapter-drizzle drizzle-orm
# Pick your driver:
bun add postgres          # pg (node-postgres)
bun add mysql2            # MySQL
bun add better-sqlite3    # SQLite
```

---

## How it works

`DrizzleDatabase` receives `{ client, schema }` and walks every key of the schema object.
It uses duck-typing — any value that looks like a drizzle table (has at least one column
with `name` + `dataType` string properties) becomes a `DrizzleResource`. No import-time
codegen or DMMF equivalent is needed.

Foreign keys are detected by inspecting the table-level Symbol arrays that Drizzle
attaches at build time (`Symbol(drizzle:PgInlineForeignKeys)` and equivalent MySQL/SQLite
variants). The referenced table name is resolved to a resource id, enabling the UI to
render relation reference inputs.

---

## NestJS setup

```ts
// admin.module.ts
import { Module } from '@nestjs/common'
import { ModernAdminModule } from '@modern-admin/nest'
import { DrizzleDatabase, DrizzleResource } from '@modern-admin/adapter-drizzle'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema.js'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle(pool, { schema })

@Module({
  imports: [
    ModernAdminModule.forRoot({
      adapters: [{
        Database: DrizzleDatabase,
        Resource: DrizzleResource,
      }],
      databases: [{ client: db, schema }],
    }),
  ],
})
export class AdminModule {}
```

---

## Configuration reference

`DrizzleDatabaseConfig`:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `client` | Drizzle client | — | `drizzle(driver, { schema })` |
| `schema` | `{ [key: string]: DrizzleTable }` | — | Your schema export |
| `dialect` | `'pg' \| 'mysql' \| 'sqlite'` | `'pg'` | Dialect; affects time-series SQL and string filter operator |
| `resources` | `Record<string, { id?: string }>` | — | Per-table resource id overrides |

---

## Schema example

```ts
// schema.ts
import { pgTable, text, integer, timestamp, uuid } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id:        uuid('id').primaryKey(),
  email:     text('email').notNull().unique(),
  name:      text('name'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const posts = pgTable('posts', {
  id:        uuid('id').primaryKey(),
  title:     text('title').notNull(),
  body:      text('body'),
  authorId:  uuid('author_id').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
```

The adapter exposes `users` and `posts` as two admin resources, with `authorId` detected
as a `reference` property pointing at the `users` resource.

---

## Field type mapping

| Drizzle `dataType` | Core `PropertyType` | Notes |
|-------------------|-------------------|-------|
| `string` | `'string'` (or `'uuid'` when column name matches `/id/i`) | |
| `number` / `bigint` | `'number'` | |
| `boolean` | `'boolean'` | |
| `date` | `'datetime'` | |
| `json` | `'json'` | |
| `buffer` | `'string'` | |
| `array` | element type + `isArray: true` | `baseColumn.dataType` used for inner type |
| column with `enumValues` | `'enum'` | |
| FK column | `'reference'` | |

---

## Resource id override

By default the resource id is the table's actual SQL name (`table._?.name ?? tableKey`).
Override it per-table via `resources`:

```ts
databases: [{
  client: db,
  schema,
  resources: {
    users: { id: 'admins' },   // expose the "users" table as "admins"
  },
}]
```

---

## Postgres array columns

Postgres array columns (`text[]`, `integer[]`) are supported:

- **Filter in**: `arrayOverlaps(column, values)` when filtering with a list
- **Filter exact**: `arrayContains(column, [value])` when filtering with a scalar
- `isArray: true` is set on the property so the UI renders a multi-select

---

## Filter operators

The Drizzle adapter translates the core `Filter` shape to drizzle operators:

| Filter shape | Drizzle operator |
|---|---|
| Scalar equality | `eq` |
| String equality (`pg`) | `ilike` (case-insensitive) |
| String equality (MySQL/SQLite) | `like` |
| Array `[values]` | `inArray` (scalar column) / `arrayOverlaps` (array column) |
| Range `{ from, to }` | `gte` + `lte` |
| Array column + scalar | `arrayContains` |

---

## Transactions

`DrizzleResource.transaction(fn)` wraps `fn` in `client.transaction()` when the drizzle
client exposes it (available in all official drivers).

---

## CLI — generate system tables

The `modern-admin generate` command auto-detects Drizzle (by finding `drizzle.config.ts`)
and writes a `generated/modern-admin-schema.ts` re-export. See the [CLI](../cli) page for
details.
