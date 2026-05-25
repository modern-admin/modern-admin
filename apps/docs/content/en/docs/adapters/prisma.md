---
title: Prisma adapter
description: Connect Prisma 7 to Modern Admin — setup, type mapping, enums, relations, and error handling.
---

# Prisma adapter

`@modern-admin/adapter-prisma` wraps Prisma 7 and exposes every model in your schema
as an admin resource with zero additional configuration.

---

## Installation

```sh
bun add @modern-admin/adapter-prisma @prisma/client
```

The adapter does not install `@prisma/client` — it must be a direct project dependency
so the generated client types and DMMF are available.

---

## How it works

`PrismaDatabase` receives `{ client, dmmf }` and reads `dmmf.datamodel.models` at
construction time. It creates one `PrismaResource` per model; properties are built from
the DMMF field list without any runtime introspection or extra queries.

The `dmmf` object is the static `Prisma.dmmf` constant exported by the generated client —
it is available immediately at import time and requires no async setup.

---

## NestJS setup

```ts
// admin.module.ts
import { Module } from '@nestjs/common'
import { ModernAdminModule } from '@modern-admin/nest'
import { PrismaDatabase, PrismaResource } from '@modern-admin/adapter-prisma'
import { Prisma } from './generated/prisma/index.js'   // generated client exports
import { prisma } from './db.js'                       // your PrismaClient singleton

@Module({
  imports: [
    ModernAdminModule.forRoot({
      adapters: [{
        Database: PrismaDatabase,
        Resource: PrismaResource,
      }],
      databases: [{ client: prisma, dmmf: Prisma.dmmf }],
    }),
  ],
})
export class AdminModule {}
```

### PrismaClient singleton

```ts
// db.ts
import { PrismaClient } from './generated/prisma/index.js'

export const prisma = new PrismaClient({
  log: process.env.PRISMA_LOG === '1' ? ['query', 'warn', 'error'] : ['warn', 'error'],
})
```

Prisma 7 connects lazily — the first query opens the connection, so importing `db.ts`
does not block startup.

---

## Configuration reference

`PrismaDatabaseConfig`:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `client` | `PrismaClient` | — | Your generated client instance |
| `dmmf` | `typeof Prisma.dmmf` | — | Static DMMF from the generated package |
| `dialect` | `'pg' \| 'mysql' \| 'sqlite'` | `'pg'` | Database dialect (used in time-series SQL display) |

---

## Resource naming

The `PrismaResource` id defaults to `model.name` (the Prisma schema model name, e.g.
`Customer`). When shared resource controllers reference resources by a lowercase logical
id (e.g. `customers`), you can remap it by passing a modified DMMF model object:

```ts
// Build a config that exposes the "Customer" model as "customers"
const config: PrismaResourceConfig = {
  model: { ...Prisma.dmmf.datamodel.models.find(m => m.name === 'Customer')!, name: 'customers' },
  client: prisma as never,
  clientKey: 'customer',   // the actual PrismaClient delegate key (lowercase-first)
  enums: Prisma.dmmf.datamodel.enums as never,
}
```

`clientKey` defaults to `lowercaseFirst(model.name)` — the standard Prisma convention —
so you only need to set it explicitly when overriding `model.name`.

---

## Field type mapping

| Prisma scalar | Core `PropertyType` |
|---------------|-------------------|
| `String` | `'string'` (or `'uuid'` when field name matches `/id/i`) |
| `Boolean` | `'boolean'` |
| `Int` / `BigInt` | `'number'` |
| `Float` / `Decimal` | `'float'` |
| `DateTime` | `'datetime'` |
| `Json` | `'json'` |
| `Bytes` | `'string'` |
| Enum type | `'enum'` |
| Relation (`kind: 'object'`) | `'reference'` |

List fields (`isList: true`) set `isArray: true` on the property.

---

## Enum support

Enums declared in `schema.prisma` are picked up automatically from
`dmmf.datamodel.enums` and surfaced as `availableValues` on the property.
The UI renders them as a `<Select>` in edit forms.

---

## Relation properties

Relation fields (`kind: 'object'`) become `type: 'reference'` properties. The
`reference()` getter returns the related model name (e.g. `'Customer'`). Because
Prisma relations are virtual (not direct columns), they are marked as non-editable
(`isEditable() → false`) by default; you must use custom actions or `@PropertyOptions`
to enable explicit `connect` semantics.

---

## Validation error handling

The adapter translates known Prisma error codes into `ValidationError` so the REST/GraphQL
layer returns per-field messages instead of a generic 500:

| Prisma code | Cause | Core error type |
|-------------|-------|----------------|
| `P2002` | Unique constraint violation | `type: 'unique'` on the constraint fields |
| `P2003` | Foreign key constraint failure | `type: 'foreignKey'` on the FK field |

All other errors propagate as-is.

---

## Transactions

`PrismaResource.transaction(fn)` wraps `fn` in `client.$transaction()` when available.
The NestJS module calls this automatically around create/update/delete invocations when
the transport enables transactions.

---

## CLI — generate system tables

The `modern-admin generate` command auto-detects Prisma (by finding `schema.prisma`) and
appends system model blocks for the features you enable. See the [CLI](../cli) page for
details.
