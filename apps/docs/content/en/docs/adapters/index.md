---
title: ORM Adapters
description: Connect Prisma or Drizzle to Modern Admin, or write your own adapter.
---

# ORM Adapters

An adapter is the bridge between Modern Admin and a specific ORM. It translates
the generic `Filter` / `FindOptions` query shapes into ORM-specific calls and
maps schema metadata (field names, types, relations) into `BaseProperty` descriptors
the panel understands.

Two adapters are bundled:

| Package | ORM | Dialects |
|---------|-----|---------|
| `@modern-admin/adapter-prisma` | Prisma 7 | PostgreSQL, MySQL, SQLite |
| `@modern-admin/adapter-drizzle` | Drizzle 0.45 | PostgreSQL, MySQL, SQLite |

---

## How adapters work

```
ModernAdminModule.forRoot({ adapters, databases })
        │
        ▼
ResourcesFactory
  ├─ for each db config: finds the matching adapter via isAdapterFor()
  └─ calls database.resources() → [BaseResource, ...]
        │
        └─ each BaseResource exposes:
             properties() → [BaseProperty, ...]   ← schema metadata
             find / findOne / findMany            ← queries
             create / update / delete             ← mutations
```

`databases` is the array of raw ORM configs (e.g. `{ client, dmmf }` for Prisma).
`adapters` is the array of `{ Database, Resource }` class pairs. The factory iterates
`databases` and calls `Database.isAdapterFor(config)` to pick the right one.

---

## Multiple databases

You can register multiple databases simultaneously. Each database exposes its own
resources; all are aggregated under the same admin API:

```ts
ModernAdminModule.forRoot({
  adapters: [
    { Database: PrismaDatabase, Resource: PrismaResource },
    { Database: DrizzleDatabase, Resource: DrizzleResource },
  ],
  databases: [
    { client: prisma, dmmf: Prisma.dmmf },                // Prisma on Postgres
    { client: drizzleDb, schema, dialect: 'sqlite' },      // Drizzle on SQLite
  ],
})
```

`ResourcesFactory` matches each database config to an adapter by calling
`Database.isAdapterFor(config)` — the Prisma adapter accepts configs with a `dmmf`
field; the Drizzle adapter accepts configs with a `schema` field.

---

## Time-series analytics

Both adapters implement `supportsTimeSeries(): true` and `aggregateTimeSeries()`.
The dashboard uses this for charts: counting or summing a numeric field over a date
range, bucketed by day / week / month / year.

```ts
// TimeSeriesQuery shape
{
  dateField: 'createdAt',     // date/datetime column to bucket by
  from: new Date('2024-01-01'),
  to:   new Date('2024-12-31'),
  step: 'month',              // 'day' | 'week' | 'month' | 'year' | 'all'
  metric: 'count',            // 'count' | 'sum' | 'avg' | 'min' | 'max'
  field?: 'amount',           // required for sum/avg/min/max
  groupBy?: 'status',         // optional series breakdown
  topN?: 10,                  // cap series count (default 10)
  comparePrevious?: true,     // run a parallel query for the previous period
}
```

The **Drizzle** adapter pushes the bucket expression down to the database
(`DATE_TRUNC` / `DATE_FORMAT` / `STRFTIME` depending on `dialect`). The **Prisma**
adapter fetches rows in the date window and buckets in JavaScript — suitable for
datasets up to ~10 k rows.

Both adapters return a `sql` string alongside the result so the UI can show the
equivalent raw query for debugging.

---

## Filter shape reference

`Filter` is the adapter-agnostic query description passed to `count()` and `find()`:

```ts
type Filter = FilterElement[]

interface FilterElement {
  path: string          // property path / column name
  value: FilterValue    // scalar | string[] | { from?, to? }
  property: BaseProperty | null
}

type FilterValue =
  | string | number | boolean | null
  | string[]                          // multi-select / IN filter
  | { from?: string; to?: string }    // date/number range
```

`FindOptions`:

```ts
interface FindOptions {
  limit?: number
  offset?: number
  sort?: Array<{ sortBy: string; direction: 'asc' | 'desc' }>
}
```
