---
title: Custom adapter
description: Implement BaseDatabase and BaseResource to connect any data source to Modern Admin.
---

# Custom adapter

If you use an ORM or data source not covered by the bundled adapters, implement two
abstract classes from `@modern-admin/core`.

---

## BaseDatabase and BaseResource

```ts
import {
  BaseDatabase,
  BaseResource,
  BaseRecord,
  type Filter,
  type FindOptions,
  type ParamsType,
} from '@modern-admin/core'

class MyResource extends BaseResource {
  override id(): string { return 'myResource' }
  override databaseType(): string { return 'myorm' }
  override properties(): BaseProperty[] { return this._props }

  override async count(filter: Filter): Promise<number> { /* … */ }
  override async find(filter: Filter, opts: FindOptions): Promise<BaseRecord[]> { /* … */ }
  override async findOne(id: string): Promise<BaseRecord | null> { /* … */ }
  override async findMany(ids: string[]): Promise<BaseRecord[]> { /* … */ }
  override async create(params: ParamsType): Promise<ParamsType> { /* … */ }
  override async update(id: string, params: ParamsType): Promise<ParamsType> { /* … */ }
  override async delete(id: string): Promise<void> { /* … */ }

  // Optional
  static override isAdapterFor(raw: unknown): boolean { return /* detect your config */ }
}

class MyDatabase extends BaseDatabase {
  override resources(): MyResource[] { /* build and return resources */ }
  static override isAdapterFor(db: unknown): boolean { return /* detect your config */ }
}
```

Register it like any built-in adapter:

```ts
ModernAdminModule.forRoot({
  adapters: [{ Database: MyDatabase, Resource: MyResource }],
  databases: [myDbConfig],
})
```

---

## BaseRecord

Return `new BaseRecord(row, resource)` from `find` / `findOne` / `findMany`.
`row` is `Record<string, unknown>` — the raw ORM result object.

---

## BaseProperty

Extend `BaseProperty` and pass the descriptor to `super()`:

```ts
super({
  path: 'email',            // field name / column name
  type: 'string',           // PropertyType
  isId: false,
  isRequired: true,
  isSortable: true,
  isArray: false,
  position: 1,
  reference: null,          // resource id for FK fields
  availableValues: null,    // string[] for enums
})
```

---

## PropertyType reference

| `PropertyType` | UI treatment |
|---|---|
| `'string'` | Text input |
| `'number'` | Number input |
| `'float'` | Number input with decimal |
| `'boolean'` | Checkbox / switch |
| `'date'` | Date picker (`mode="date"`) |
| `'datetime'` | Date picker (`mode="datetime"`) |
| `'json'` | JSON editor |
| `'mixed'` | JSON editor |
| `'enum'` | Select from `availableValues` |
| `'reference'` | Reference combobox (looks up related resource) |
| `'uuid'` | Displayed as monospace; auto-generated on create |
| `'richtext'` | Rich-text editor |
| `'currency'` | Number input with currency formatting |
| `'password'` | Password input with show/hide toggle |
| `'file'` | File upload (requires `@modern-admin/feature-upload`) |
| `'m2m'` | Many-to-many picker (requires `@modern-admin/feature-m2m`) |

---

## Time-series support (optional)

Implement `supportsTimeSeries()` and `aggregateTimeSeries()` to power dashboard charts
for your resource. The dashboard calls `supportsTimeSeries()` first; when it returns
`false`, the chart tile shows a "not supported" message instead of querying.

```ts
override supportsTimeSeries(): boolean { return true }

override async aggregateTimeSeries(query: TimeSeriesQuery): Promise<TimeSeriesResult> {
  // implement bucketing logic for your database
}
```

See `packages/adapter-drizzle/src/resource.ts` for a reference implementation that
pushes `DATE_TRUNC` down to Postgres.
