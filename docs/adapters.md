---
title: Adapters
description: Plug an ORM into Modern Admin or write your own adapter.
---

# Adapters

An adapter teaches Modern Admin how to read and mutate records in a
particular ORM. Two adapters are bundled:

- `@modern-admin/adapter-prisma` — Prisma 7
- `@modern-admin/adapter-drizzle` — Drizzle 0.45 (Postgres / MySQL / SQLite)

## Prisma

```ts
import { PrismaDatabase } from '@modern-admin/adapter-prisma'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

ModernAdminModule.forRoot({
  databases: [new PrismaDatabase(prisma)],
})
```

`PrismaDatabase` reads Prisma's DMMF at construction time, building a
`PrismaResource` per model. Properties are inferred from the schema:
scalars become typed primitives, `@id` columns become the title key, and
relations are exposed as `reference` properties.

## Drizzle

```ts
import { DrizzleDatabase } from '@modern-admin/adapter-drizzle'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from './schema'

const db = drizzle(connectionString, { schema })

ModernAdminModule.forRoot({
  databases: [new DrizzleDatabase(db, schema)],
})
```

The adapter walks the exported schema, picks out `pgTable` / `mysqlTable` /
`sqliteTable` definitions, and reads foreign-key metadata from the
table-level symbol arrays Drizzle exposes (`Symbol(drizzle:PgInlineForeignKeys)`
and friends) to wire reference properties.

## Writing your own adapter

Implement two abstract classes from `@modern-admin/core`:

```ts
import {
  BaseDatabase,
  BaseResource,
  type BaseProperty,
  type BaseRecord,
  type Filter,
  type FindOptions,
  type Params,
} from '@modern-admin/core'

class MyResource extends BaseResource {
  id(): string { return this.modelName }
  properties(): BaseProperty[] { /* … */ }
  async count(filter: Filter): Promise<number> { /* … */ }
  async find(filter: Filter, opts: FindOptions): Promise<BaseRecord[]> { /* … */ }
  async findOne(id: string): Promise<BaseRecord | null> { /* … */ }
  async findMany(ids: string[]): Promise<BaseRecord[]> { /* … */ }
  async create(params: Params): Promise<Params> { /* … */ }
  async update(id: string, params: Params): Promise<Params> { /* … */ }
  async delete(id: string): Promise<void> { /* … */ }
}

class MyDatabase extends BaseDatabase {
  resources(): BaseResource[] { /* … */ }
  static isAdapterFor(db: unknown): boolean { /* … */ }
}
```

Pass an instance of `MyDatabase` to `ModernAdminModule.forRoot({ databases: [...] })`
— that's it. The transports (REST, GraphQL, WS) automatically expose every
resource your adapter yields.

## Filter shape

`Filter` is the canonical filter shape adapters convert to ORM-specific
queries:

```ts
interface Filter {
  // property name → operator → value
  filters: Record<string, { operator: 'eq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in', value: unknown }>
}
```

`FindOptions` carries `{ limit, offset, sort: [{ field, direction }] }`.
The Drizzle adapter's `converters.ts` is a small reference for how to
translate this shape to ORM operators.

## Properties

`BaseProperty` exposes:

```ts
interface BaseProperty {
  path(): string                    // e.g. 'email' or 'profile.name'
  type(): PropertyType              // 'string' | 'number' | 'boolean'
                                    //   | 'date' | 'datetime' | 'reference'
                                    //   | 'mixed' | 'richtext' | 'currency'
  isId(): boolean
  isTitle(): boolean
  isVisible(): boolean
  isEditable(): boolean
  reference(): string | null        // referenced resource id, for FKs
  availableValues(): Array<{value, label}> | null  // enums
}
```

Adapters build these from the ORM's metadata; user-supplied
`PropertyOptions` in `ResourceOptions.properties` override the defaults at
runtime.
