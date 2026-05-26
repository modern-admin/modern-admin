# Resources, properties, hide-vs-expose

## Adding a resource — the canonical recipe

Every resource in this framework is built from **three** pieces:

1. A **source registry** — one per host app, maps logical resource ids
   to adapter-specific raw source objects.
2. A **resource controller** — extends `AdminController<RowType>`,
   carries `@AdminResource(...)` metadata, hooks (`@Before`/`@After`)
   and custom actions (`@Action`).
3. A **NestJS module** that registers the controller.

### Source registry — one file per host app

```ts
// src/admin-sources.ts (Prisma host)
import { registerAdminSources } from '@modern-admin/app-shared'
import type { PrismaResourceConfig } from '@modern-admin/adapter-prisma'
import { dmmf, prisma } from './db.js'

const lowerFirst = (s: string): string =>
  s.length === 0 ? s : s.charAt(0).toLowerCase() + s.slice(1)

// Prisma model name → logical resource id.
// Keep this map in sync with `registerAdminSources` below.
const MODEL_TO_LOGICAL: Record<string, string> = {
  MaUser:    'admins',
  MaRole:    'roles',
  Product:   'products',
  Order:     'orders',
  // …one entry per managed model
}

const buildPrismaSource = (
  modelName: string,
  logicalId: string,
): (() => PrismaResourceConfig) => () => {
  const model = dmmf.datamodel.models.find((m) => m.name === modelName)
  if (!model) {
    throw new Error(
      `[admin] Prisma model "${modelName}" not found in DMMF — ` +
      `did you forget \`bun run prisma:generate\` after editing schema.prisma?`,
    )
  }
  // CRITICAL: rewrite relation field `type` from Prisma model name to
  // logical id, so the adapter's FK→reference map resolves the right
  // resource. Skip this and reference autocompletes, dashboard charts,
  // and `relatedResources` lookups will silently fail.
  const fields = model.fields.map((f) => {
    if (f.kind !== 'object') return f
    const mapped = MODEL_TO_LOGICAL[f.type]
    return mapped ? { ...f, type: mapped } : f
  })
  return {
    model: { ...model, name: logicalId, fields },
    client: prisma,
    clientKey: lowerFirst(modelName),
    enums: dmmf.datamodel.enums,
  }
}

registerAdminSources({
  admins:   buildPrismaSource('MaUser', 'admins'),
  roles:    buildPrismaSource('MaRole', 'roles'),
  products: buildPrismaSource('Product', 'products'),
  orders:   buildPrismaSource('Order',   'orders'),
})
```

Import this file **before** `NestFactory.create` in `main.ts`:

```ts
import './admin-sources.js' // side-effect: populates the registry
import { NestFactory } from '@nestjs/core'
```

### Resource controller

```ts
// src/admin/products/products.controller.ts
import {
  Action,
  AdminController,
  AdminResource,
  Before,
  type AdminActionContext,
  type RecordActionResponse,
} from '@modern-admin/nest'
import { adminSource } from '../source-registry.js'

interface ProductRow {
  id: string
  name: string
  slug: string
  price: number
  stock: number
  published: boolean
  publishedAt: Date | null
  updatedAt: Date
}

@AdminResource({
  source: () => adminSource('products'),
  navigation: { icon: 'Package', group: 'Catalog' },
  titleProperty: 'name',
  listProperties: ['name', 'price', 'stock', 'published', 'updatedAt'],
  filterProperties: ['published'],
  sort: { sortBy: 'updatedAt', direction: 'desc' },
  // Tabs on the show page — one entry per FK relation pointing AT this
  // resource. Inspect the Prisma model: every `Foo[]` or `Foo?` field
  // is a candidate. Skip relations that already show as a `reference`
  // property on the parent side.
  relatedResources: [
    { resourceId: 'orderItems', foreignKey: 'productId' },
  ],
  properties: {
    id:        { isVisible: { edit: false } },
    updatedAt: { isVisible: { edit: false } },
  },
})
export class ProductsAdminController extends AdminController<ProductRow> {
  @Before('new')
  @Before('edit')
  fillSlug(ctx: AdminActionContext<ProductRow>): void {
    if (!ctx.payload.slug && typeof ctx.payload.name === 'string') {
      ctx.payload.slug = ctx.payload.name
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    }
  }

  @Action({
    actionType: 'record',
    name: 'publish',
    component: null,
    isVisible: (core) => core.record?.params.published !== true,
    custom: { icon: 'Send', label: 'Publish' },
  })
  async publish(ctx: AdminActionContext<ProductRow>): Promise<RecordActionResponse> {
    const record = ctx.record!
    await record.update({ published: true, publishedAt: new Date() })
    return {
      record: record.toJSON(),
      notice: { message: 'Product published', type: 'success' },
    }
  }
}
```

### NestJS module

```ts
// src/admin/products/products.module.ts
import { Module } from '@nestjs/common'
import { ProductsAdminController } from './products.controller.js'

@Module({ controllers: [ProductsAdminController] })
export class ProductsAdminModule {}
```

### Wire it up

```ts
// src/admin.module.ts
imports: [
  ModernAdminModule.forRoot({ /* … */ }),
  ProductsAdminModule,        // ← one line per resource
]
```

Then restart the dev server (`scripts/dev.sh restart api-prisma`).
Note: `bun --watch` does NOT pick up changes in symlinked workspace
packages, so changes inside `packages/*` always need a restart.

### Resource-creation checklist (apply to EVERY new resource)

For each Prisma model you turn into a resource:

1. **Add to `MODEL_TO_LOGICAL`** in `admin-sources.ts` and register via
   `buildPrismaSource('ModelName', 'logical-id')`. Logical ids are
   lowercase plural; Prisma model names are PascalCase singular.
2. **Define a `<Model>Row` TypeScript interface** matching the row
   shape so hook params get typed.
3. **Extend `AdminController<Row>`** — body-less classes are a smell;
   they leave you unable to add hooks/actions later without rewriting
   every reference.
4. **For each FK column** on the model: confirm it lands as a
   `reference` property (auto-detected). For each "reverse" relation
   (`Foo[]` or `Foo?`), decide whether it deserves a `relatedResources`
   entry on the show page. Skip only when the related rows are an
   implementation detail.
5. **For each sensitive column** (password hash, API key, refresh
   token, internal secret): set `isAccessible: false` — NOT just
   `isVisible: false`. See *What to hide vs. expose* below.
6. **For each "operation"** the domain expert mentions (publish,
   approve, regenerate, archive, send, retry, discard): add a custom
   `@Action({ actionType: 'record' | 'bulk' | 'resource' })` method.
   Built-in `edit` is rarely the right place for business state
   transitions. **This step is mandatory** — a resource without any
   custom `@Action` on a transactional model (`Order`, `Review`,
   `Task`, `Subscription`, …) is almost certainly under-spec'd.

   **Verb → actionType mapping:**

   | Verb in spec                        | `actionType` | Notes |
   |-------------------------------------|--------------|-------|
   | Publish, archive, approve, lock     | `record`     | Per-row state transition |
   | Resend, retry, regenerate, refresh  | `record`     | Idempotent retry on one row |
   | Test credentials, ping, validate    | `record`     | Diagnostics on one row |
   | Approve selected, archive selected  | `bulk`       | Same verb, multi-row |
   | Export, import, recompute totals    | `resource`   | Toolbar-level, no row scope |
   | Force-sync from external API        | `resource`   | Cross-row maintenance |

   Skeleton:

   ```ts
   @Action({
     actionType: 'record',
     name: 'approve',
     component: null,                        // server-only, no custom UI
     isVisible: (core) =>                    // hide when not applicable
       core.record?.params.state === 'AWAITING_HUMAN',
     custom: { icon: 'CheckCircle', label: 'Approve' },
     // guard: 'confirmApprove',             // optional confirm prompt
   })
   async approve(ctx: AdminActionContext<Row>): Promise<RecordActionResponse> {
     const r = ctx.record!
     await r.update({ state: 'AUTO_SENDING', /* … */ })
     return { record: r.toJSON(), notice: { message: 'Approved', type: 'success' } }
   }
   ```

7. **For each derived/normalised column** (slug, search-tsvector,
   `updatedBy`): add a `@Before('new')`/`@Before('edit')` hook.
8. **For each "this shouldn't ever happen" invariant** (third-party id
   must not be hand-edited, audit row must not be mutated): pin it
   with `isAccessible: false` on the relevant property/action. Do NOT
   use code-pinned `isAccessible` for ordinary role gating — see
   permissions.md §6a.

## Property type selection matrix

When deciding `type` (or letting it be inferred), use this table.
Inferred types are usually correct — override only when the database
column type is ambiguous.

| DB shape / intent                       | Use `type:`     | Reason |
|----------------------------------------|-----------------|--------|
| Plain short text                        | `string`        | Default text input |
| Multi-paragraph body                    | `textarea`      | Resizable textarea |
| HTML body, blog post                    | `richtext`      | TipTap editor with toolbar |
| Markdown body, README-style             | `markdown`      | Markdown editor with preview |
| Integer count, ID                       | `number`        | Number input, integer step |
| Decimal price                           | `money` or `currency` | Formatted with currency symbol |
| Float without currency                  | `float`         | Decimal number input |
| `true/false` flag                       | `boolean`       | Switch / checkbox |
| Date only (no time)                     | `date`          | Date picker |
| Date + time                             | `datetime`      | Date-time picker |
| Closed enum (Prisma enum / string list) | `enum`          | Select; `availableValues` required |
| FK to another resource                  | `reference`     | Auto-detected; set `reference: 'id'` to override |
| Many-to-many through join table         | `m2m`           | Requires `@modern-admin/feature-m2m` |
| Free-form JSON, known keys              | `json` + `keyValueFields` | Friendly per-key editor |
| Free-form JSON, unknown keys            | `json`          | Raw JSON editor |
| File upload (single)                    | `file`          | Requires `@modern-admin/feature-upload` |
| Multiple files                          | `file` + `isArray: true` | Same plugin |
| Phone number                            | `phone`         | International phone input |
| Color picker                            | `color`         | Hex color swatch |
| Password (hash stored)                  | `password`      | Hidden by default; use `feature-password` |
| UUID id                                 | `uuid`          | Monospace, read-only |
| Image preview from URL                  | `previewMedia`  | Renders thumbnail in list |

Heuristic checklist for each property:

1. Is the column a Prisma enum? → leave inferred (`enum`).
2. Is the column a JSON column with a known schema? → `keyValueFields`.
3. Is it a price/amount? → `money` (locale-aware) over raw `number`.
4. Does the column store an FK? → leave inferred (`reference`).
5. Is the field name `password`/`apiKey`/`secret`/`token`? → `password`
   type AND `isVisible: false` on list/show. Mutation through a custom
   action only.

## What to hide vs. expose

**Hide everywhere** (`isVisible: false` plus `isAccessible: false`
when leaks would be sensitive):

- Hashed passwords, OAuth refresh tokens, API keys, internal IDs that
  are not stable contracts, audit columns the admin should not edit
  (`createdAt`, `updatedAt` — show on `show`/`list`, hide from `edit`).
- Any column the host backend treats as a foreign system's authority
  (Stripe customer id, Sentry org id, …) unless the admin explicitly
  needs to debug it. In that case: `isVisible: { show: true }` only.

**Hide from list, keep on show** (`isVisible: { list: false }`):
- Long text fields, descriptions, blobs of JSON, attached files
  metadata — they explode the list table width.

**Hide from edit** (`isVisible: { edit: false }`):
- Server-computed fields: `id`, `createdAt`, `updatedAt`, derived
  totals, denormalised counters.

**Defaults already provided** by `BaseProperty.isVisible()`:
- Anything matching `/password/i` is hidden by default.
- IDs are not editable by default (`isEditable() === false`).

Do not "hide" by removing properties from `listProperties` only — that
just changes the default column set; the field is still in the
response payload. Use `isAccessible: false` if the field must never
leave the server.
