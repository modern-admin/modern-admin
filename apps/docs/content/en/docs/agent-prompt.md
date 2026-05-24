---
title: AI Agent Integration Prompt
description: Meta-prompt for AI coding agents integrating Modern Admin into an existing project. Paste into the agent's system prompt.
---

# Modern Admin — AI Agent Integration Prompt

> Paste this file into the system prompt of any AI coding agent
> (Claude Code, Cursor, Aider, …) that is going to install, configure,
> or extend Modern Admin in a host project. It encodes the project's
> non-obvious rules so the agent does not have to re-discover them.

---

## 0. Role and ground rules

You are integrating `@modern-admin/*` into a host project. Treat
Modern Admin as a **vendor framework** — do not modify its source,
only call its public exports. When making decisions:

1. Prefer auto-discovery over manual configuration. Override only
   what diverges from defaults.
2. Never hardcode user-visible strings — see §6 i18n.
3. Use UUID v7 (`uuidv7()` from `@modern-admin/core`) for every
   identifier you generate. No `crypto.randomUUID()`, no `nanoid`.
4. Package manager and runtime is **bun**. Never use npm/yarn/pnpm.
5. Use the **latest stable** version of every dependency.
6. Mobile-first: any new UI must work at ≤375px viewport width.

---

## 1. When to use Modern Admin

Use it when the host project needs CRUD over a relational store
(PostgreSQL via Prisma 7 or Drizzle 0.45) plus role-gated actions,
search, filters, file uploads, audit log, revisions, webhooks, or an
AI assistant — with zero custom UI code per resource.

Do **not** use it for:
- Public-facing UI. It's an internal admin panel.
- Non-relational stores with no SQL adapter (Mongo, DynamoDB).
- Workflows where the admin should not share a DB with the main app
  (use it as a separate service against a replica instead).

---

## 2. Deployment model — default to **standalone**

The recommended layout is a **separate NestJS service** that talks to
the same Postgres as the main backend. Reasons: independent deploys,
smaller attack surface, language-agnostic main backend.

Scaffold with:

```sh
MODERN_ADMIN_TOKEN=ghp_xxx bun create @modern-admin admin-service
```

This produces a NestJS 11 app with:

- `prisma/schema.prisma` — `ma_*` system tables only (admins, sessions,
  roles, logs, history, config, dashboards, cache).
- `src/main.ts` — `createBetterAuthMiddleware(toNodeHandler(auth))` mounted at
  `/admin/api/auth` **before** any body parser (see §11d).
- `src/admin.module.ts` — `ModernAdminModule.forRoot({...})` wired with
  Prisma + Better Auth.
- `src/app.module.ts` — imports both `AdminModule` and
  `ModernAdminStaticUiModule.forRoot({ path: '/admin', … })` so the
  prebuilt `@modern-admin/web` SPA is served at `/admin` from the same
  origin as the API. Without this module the API returns 404 for `/admin`
  and any deep refresh — see §11c.
- `src/db.ts` — `PrismaPg` driver adapter + `getDMMF` from
  `@prisma/internals` (Prisma 7 client no longer exposes
  `Prisma.dmmf`).
- `src/auth.ts` — Better Auth with `modelName: 'MaUser'` etc. (the
  Prisma model name, NOT the physical table name `ma_user`).

Mount it under `/admin` of the main domain via reverse proxy. Do not
serve the SPA from a separate origin unless you also configure CORS.

---

## 2.5. Detecting an existing Prisma project — REUSE, do NOT duplicate

If the host project **already has** a Prisma schema and generated
client, the agent MUST integrate with it instead of producing parallel
artefacts. Before scaffolding ANY admin code, run this analysis:

1. **Find the existing schema.** Look for `prisma/schema.prisma` in
   the repo root, in `apps/*/prisma`, in `packages/*/prisma`, and in
   directories named in `package.json#prisma.schema`.
2. **Find the existing generator output.** Read the `generator client`
   block — the `output` path is where the client lives.
3. **Decide where the admin-service lives:**
   - **Same workspace as the host** → import the host's existing
     `PrismaClient` directly. Do NOT add a second `generator` to the
     schema. Do NOT generate a parallel client in
     `admin-service/src/generated/prisma`.
   - **Separate repo / separate deployable** → still keep ONE schema.
     Mount the existing schema file into the admin-service container
     (Docker volume or git submodule) and run `prisma generate`
     against it from inside the admin-service to produce its own
     ESM-shaped client, but **never edit the schema fork** — open a
     PR back to the host's schema.

**Merging `ma_*` tables into the host's schema (the only acceptable
mutation):**

The canonical fragment lives at
`packages/system-prisma/prisma/modern-admin.prisma` in the
`modern-admin` repo. It defines **fourteen** `Ma*` models — copy ALL
of them verbatim, not a subset. `setupPrismaSystem(prisma)` resolves
every delegate eagerly on boot and throws at startup if any are
missing:

```
[modern-admin/system-prisma] missing delegate "prisma.maWebhook".
Make sure the Modern Admin schema fragment is included in your
schema.prisma (see @modern-admin/system-prisma/schema), and that the
Prisma client has been generated.
   at resolveDelegate ( …/system-prisma/dist/types.js )
   at setupPrismaSystem ( …/system-prisma/dist/index.js )
```

This error is a **runtime failure, not a typecheck failure** —
`bun run dev` will still start the process, but the framework module
will refuse to load. Cherry-picking 10 of 14 models compiles fine and
fails the moment a request lands.

```diff
  // host/prisma/schema.prisma
  model Product { ... }
  model Order   { ... }
+
+ // ── Modern Admin system tables (ALL 14 required) ─────────────
+ // Better Auth (5):
+ model MaUser          { ... }
+ model MaSession       { ... }
+ model MaAccount       { ... }
+ model MaVerification  { ... }
+ model MaApiKey        { ... }
+ // Modern Admin core (9):
+ model MaRole             { ... }
+ model MaLog              { ... }
+ model MaWebhook          { ... }   // ← easy to forget
+ model MaWebhookDelivery  { ... }   // ← easy to forget
+ model MaConfig           { ... }
+ model MaHistory          { ... }
+ model MaAiTask           { ... }   // ← easy to forget
+ model MaAiTaskEvent      { ... }   // ← easy to forget
+ model MaCache            { ... }
```

Copy the `ma_*` model definitions verbatim from
`packages/system-prisma/prisma/modern-admin.prisma` in the
modern-admin repo — that file is the source of truth. After merging,
run `bun run prisma:generate` and create one migration named
`add_modern_admin_system_tables`; commit the migration together with
the schema change.

**Verification step (do this before declaring scaffold done):**

```bash
# Every one of these must list a Prisma model — empty output means
# the schema is incomplete and `setupPrismaSystem` will throw on boot.
grep -E '^model (MaUser|MaSession|MaAccount|MaVerification|MaApiKey|MaRole|MaLog|MaWebhook|MaWebhookDelivery|MaConfig|MaHistory|MaAiTask|MaAiTaskEvent|MaCache) ' prisma/schema.prisma
```

**Anti-pattern — duplicated generator (DO NOT DO):**

```prisma
// ❌ NEVER add a second generator just to produce an ESM client for
//    admin-service. The two clients drift, every `prisma migrate`
//    needs two `prisma generate` runs, and bun-native imports work
//    fine against the host's CJS client.
generator adminClient {
  provider = "prisma-client"
  output   = "../admin-service/src/generated/prisma"
}
```

If the host client is CJS and admin-service is bun/ESM, you can still
import the CJS client from ESM — bun handles the interop. A separate
generator output is only justified when the two clients target truly
different Prisma versions, and that is a smell, not a feature.

---

## 3. Adding a resource — the canonical recipe

Every resource in this framework is built from **three** pieces:

1. A **source registry** — one per host app, maps logical resource ids
   to adapter-specific raw source objects.
2. A **resource controller** — extends `AdminController<RowType>`,
   carries `@AdminResource(...)` metadata, hooks (`@Before`/`@After`)
   and custom actions (`@Action`).
3. A **NestJS module** that registers the controller.

### 3a. Source registry — one file per host app

```ts
// src/admin-sources.ts (Prisma host)
import { registerAdminSources } from '@modern-admin/app-shared'
import type { DmmfModel, PrismaResourceConfig } from '@modern-admin/adapter-prisma'
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
  const model = dmmf.datamodel.models.find((m) => m.name === modelName) as
    | DmmfModel
    | undefined
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
    client: prisma as never,
    clientKey: lowerFirst(modelName),
    enums: dmmf.datamodel.enums as never,
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

### 3b. Resource controller

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

### 3c. NestJS module

```ts
// src/admin/products/products.module.ts
import { Module } from '@nestjs/common'
import { ProductsAdminController } from './products.controller.js'

@Module({ controllers: [ProductsAdminController] })
export class ProductsAdminModule {}
```

### 3d. Wire it up

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

### 3e. Resource-creation checklist (apply to EVERY new resource)

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
   `isVisible: false`. See §5.
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
   use code-pinned `isAccessible` for ordinary role gating — see §6a.

---

## 4. Property type selection matrix

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

---

## 5. What to hide vs. expose

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

---

## 6. Permissions — roles × actions matrix

Modern Admin gates every `invoke()` call through a permissions matrix.
Wiring:

```ts
ModernAdminModule.forRoot({
  // …
  rolesResourceId: 'roles',  // resource id whose rows are MaRole
})
```

The matrix lives in `MaRole.permissions` as JSON:

```json
{ "products": ["list", "show"], "orders": ["*"], "*": ["list"] }
```

Wildcards: `"*"` as a key matches any resource; `["*"]` as the value
matches any action. The `admin` role is seeded with `{ "*": ["*"] }`.

### 6a. WHERE policy lives — DB-driven (default) vs code-pinned

There are two places a permission rule can live:

- **DB-driven (default, preferred)** — `MaRole.permissions` JSON,
  edited by admins through the panel. Use this for any rule the
  product owner might want to tune without a deploy. Seed
  baseline roles (`admin`, `editor`, `viewer`) at boot, then never
  touch them in code.
- **Code-pinned** — `isAccessible` on a property or action in the
  resource decorator. Use this **only** for rules that are
  invariants of the data model (e.g. nobody, ever, including the
  `admin` role, may PATCH an immutable audit row). If you find
  yourself writing `currentAdmin?.role === 'admin'` inside a
  resource, you are duplicating what the role matrix already
  expresses — delete the code and seed the role instead.

> **Anti-pattern:** declaring both at once. If `MaRole(admin).permissions`
> already grants `delete` on `apps`, and the resource also pins
> `isAccessible: ({currentAdmin}) => currentAdmin?.role === 'admin'`,
> changing the role in the panel produces no effect — the code
> overrides it. Pick one. The DB-driven path is almost always right.

### 6b. NestJS-style: `actions:` key is FORBIDDEN in `@AdminResource`

> ⚠️ This is the #1 mistake AI agents make. Read it twice.

The `@modern-admin/nest` decorator type is
`AdminResourceMeta = Omit<ResourceOptions, 'actions'> & { source, ... }`
(see `packages/nest/src/admin/decorators.ts`). **The `actions:` key
does not exist on the decorator argument.** Any code like

```ts
// ❌ TS2353: Object literal may only specify known properties,
//    and 'actions' does not exist in type 'AdminResourceMeta'.
@AdminResource({
  source: () => adminSource('reviews'),
  actions: {
    new:    { isAccessible: false },
    delete: { isAccessible: false },
  },
})
```

is rejected by TypeScript and would not work even with a cast — the
scanner never reads it. In the NestJS style, actions are configured
**exclusively** through method-level decorators on the controller
class:

| Goal                                          | How to achieve it in NestJS style                  |
|-----------------------------------------------|----------------------------------------------------|
| Add a custom action (button)                  | `@Action({...})` method                            |
| Override a built-in handler                   | Method named `delete` / `edit` / `new` / `bulkDelete` / `list` / `show` / `search` |
| Add a `before`/`after` hook                   | `@Before('actionName')` / `@After('actionName')`   |
| **Hide / disable a built-in for a role**      | **Permissions matrix in `MaRole.permissions`** — NOT in code |
| Hide a built-in for ALL roles (true invariant)| `@Action({ name: 'delete', actionType: 'record', isAccessible: false })` on a stub method (see 6c) |

### 6c. Making a resource read-only — through roles, not code

The right way to make `Review` / `AuditLog` / `Reply` read-only is to
seed the `editor` (and any other non-admin) role with a restricted
permissions list:

```ts
// One-time seed (e.g. in a Nest `OnApplicationBootstrap` hook).
await prisma.maRole.upsert({
  where: { id: 'editor' },
  create: {
    id: 'editor',
    description: 'Read-only for review streams, full access to apps',
    permissions: {
      // read-only resources
      reviews:              ['list', 'show'],
      'audit-logs':         ['list', 'show'],
      replies:              ['list', 'show'],
      'review-processings': ['list', 'show', 'edit'],
      // editable resources
      apps:           ['*'],
      moderators:     ['*'],
      'global-config':['list', 'show', 'edit'],
      // hidden entirely
      admins: [],
      roles:  [],
    },
    isBuiltin: false,
  },
  update: {},
})
```

The `admin` role keeps `{ "*": ["*"] }`. Users with no role match get
nothing.

This single-source-of-truth approach beats the "disable in code"
approach because:
- The product owner can tune permissions through the admin UI
  without a redeploy.
- All visibility rules live in one place (the role row).
- The same logic governs the API and the UI — `invoke()` rejects
  unauthorised calls server-side regardless of what the UI does.

### 6d. Overriding a built-in action — signature MUST match the base class

Every built-in (`list`/`show`/`new`/`edit`/`delete`/`bulkDelete`/`search`)
is declared on `AdminController<TRow>` with a precise signature, e.g.

```ts
async delete(ctx: DeleteContext<TRow>): Promise<RecordActionResponse>
```

Any override on a subclass MUST keep that signature, otherwise
TypeScript emits `TS2416: Property 'delete' in type 'X' is not
assignable to the same property in base type 'AdminController<...>'`.

**Wrong** — `() => void` is not `(ctx) => Promise<RecordActionResponse>`:

```ts
// ❌ TS2416
@Action({ actionType: 'record', name: 'delete', guard: 'confirmDeleteAdmin' })
delete() {}
```

**Right** — add `guard:` while delegating to the default handler:

```ts
import type { DeleteContext, RecordActionResponse } from '@modern-admin/nest'

@Action({ actionType: 'record', name: 'delete', guard: 'confirmDeleteAdmin' })
override async delete(ctx: DeleteContext<MaUserRow>): Promise<RecordActionResponse> {
  return super.delete(ctx)   // keep default behaviour
}
```

The `super.delete(ctx)` call is essential — without it, the action
becomes a no-op (the empty method replaces the default handler).

### 6e. True invariants — `@Action`-decorated stub with `never` return

When a constraint must hold **for every role, including `admin`**
(e.g. `ReviewProcessing` rows are created by the background pipeline
only, never by humans), express it with an `isAccessible: false`
stub. Return type **must be either `Promise<never>` or `never`** so
that the override is signature-compatible with the base class
(`never` is a subtype of every other type):

```ts
import {
  Action,
  AdminController,
  AdminResource,
  type DeleteContext,
  type BulkDeleteContext,
  type NewContext,
  type RecordActionResponse,
} from '@modern-admin/nest'

@AdminResource({
  source: () => adminSource('audit-logs'),
  // …
})
export class AuditLogAdminController extends AdminController<AuditLogRow> {
  @Action({ actionType: 'resource', name: 'new', isAccessible: false })
  override async new(_ctx: NewContext<AuditLogRow>): Promise<never> {
    throw new Error('unreachable')
  }
  @Action({ actionType: 'record', name: 'delete', isAccessible: false })
  override async delete(_ctx: DeleteContext<AuditLogRow>): Promise<never> {
    throw new Error('unreachable')
  }
  @Action({ actionType: 'bulk', name: 'bulkDelete', isAccessible: false })
  override async bulkDelete(_ctx: BulkDeleteContext<AuditLogRow>): Promise<never> {
    throw new Error('unreachable')
  }
}
```

Mind the parameter types — `DeleteContext<Row>` for `delete`,
`BulkDeleteContext<Row>` for `bulkDelete`, `NewContext<Row>` for
`new`, `EditContext<Row>` for `edit`. Importing the wrong context
type produces another `TS2416`.

This is verbose by design — if you find yourself writing it on more
than one or two resources, you almost certainly want the role-matrix
path from §6c instead.

### 6f. Sealed-invariant `isAccessible` on properties (allowed)

`properties:` IS part of `AdminResourceMeta`, so property-level
`isAccessible` is fine:

```ts
import type { ActionContext } from '@modern-admin/core'

properties: {
  // A column whose value comes from a third-party system and must
  // never be human-edited (rustore feedback id, stripe charge id, …):
  rustoreFeedbackId: {
    isVisible:    { edit: false },   // hide from UI
    isAccessible: ({ action }: ActionContext) => action.name !== 'edit',
  },
}
```

Always type the callback as `(ctx: ActionContext) => boolean` and
import `ActionContext` from `@modern-admin/core`. Do NOT write inline
types like `({ currentAdmin }: { currentAdmin?: { role?: string } })`
— they shadow real fields (`record`, `records`, `cache`, `admin`,
`resource`) and rot when the API changes.

### 6g. `guard` — confirmation prompt, NOT a permission name

`guard: '<i18n-key>'` is the translation key for the confirm dialog
the UI shows before running a destructive action. It is **not** a
permission identifier. It lives on the `@Action(...)` decorator, not
on a hypothetical `actions:` map.

```ts
@Action({
  actionType: 'record',
  name: 'delete',
  // ↓ The built-in delete handler keeps running; this just adds a confirm.
  guard: 'confirmDeleteApp',   // i18n key, resolved client-side
})
delete() { /* … override or empty to keep default … */ }
```

Then add `confirmDeleteApp: 'Delete app "{name}"? This cannot be
undone.'` to every locale file (§12).

`guard:` and `isAccessible:` are **independent**. `isAccessible: false`
hides the button; `guard: 'foo'` adds a confirmation prompt to the
visible button. They are not interchangeable.

---

## 7. Built-in actions and when to override

| Action       | Override `handler` when …                                |
|--------------|----------------------------------------------------------|
| `list`       | You need cross-table joins / search not expressible as filters. Prefer adding `filterProperties` first. |
| `show`       | Almost never — use `relatedResources` for sibling lists. |
| `new`        | You need server-computed fields, side effects (send email), or a multi-step flow. Use `Before('new')` hook for derived columns instead when possible. |
| `edit`       | Same as `new`. Prefer `Before('edit')` for `updatedAt`-style writes. |
| `delete`     | You need soft-delete. Override handler and call `resource.update()` to set `deletedAt`. Combine with `filterProperties` to hide deleted rows by default. |
| `bulkDelete` | Same as `delete`. |
| `search`     | Reference autocomplete uses this — extend when the searchable column is not the auto-detected one. |

For business-specific operations, **add a custom action** instead of
overriding a built-in. Custom action types:

- `resource` — toolbar button on the list page.
- `record` — per-row button in the row-actions menu.
- `bulk` — toolbar button when rows are selected.

---

## 8. Plugins / features — selection guide

Modern Admin has two plugin scopes:

- **Local features** (`FeatureFn`, attached per resource via
  `options.features: []`) — run first, transform a single resource.
- **Global plugins** (`GlobalPlugin`, attached to `ModernAdmin.forRoot`
  via `plugins: []`) — run on every resource, may filter via
  `include`/`exclude`.

Built-in catalog:

| Package                          | Scope          | Use when …                                |
|----------------------------------|----------------|-------------------------------------------|
| `@modern-admin/feature-upload`   | local          | Resource has file/image columns. Pick `LocalUploadProvider` for dev, `S3UploadProvider` for prod. |
| `@modern-admin/feature-m2m`      | local          | Tags-style join table between two resources. |
| `@modern-admin/feature-password` | local          | Login-credential resource where the DB stores a hash. |
| `@modern-admin/feature-history`  | local + global | Need per-row revisions and a "history" tab on show. Use **global** if every resource should be tracked. |
| `@modern-admin-pro/feature-logging` (Pro) | local + global | Audit log of every action (who-did-what-when). Almost always wire globally with `actionLoggingPlugin`. |
| `@modern-admin-pro/feature-webhooks` (Pro) | global         | Outbound webhooks on create/edit/delete events. |
| `@modern-admin-pro/feature-ai-fill` (Pro)  | per-resource   | Add an AI "fill from photo / URL / text" button to the new/edit form. Configure model in env. |
| `@modern-admin/feature-json-by-key` | local       | Single JSON column whose schema branches on a sibling field's value (e.g. `type === 'image' ⇒ {url,alt}`). |

Auto-installed by the scaffold: `feature-upload`, `feature-history`.
The Pro tier (`@modern-admin-pro/feature-logging|webhooks|ai-fill`)
ships separately under a commercial license — see
[modernadminpro.com](https://modernadminpro.com).

Decision tree for "should I write a feature?": **don't**, unless the
transform applies to ≥3 resources. For one-off needs, hooks +
properties.custom are enough.

---

## 9. Custom UI components — when and how

The frontend ships rich defaults for every property type. Reach for a
custom component only when:

1. The data shape is unique to the host project (e.g. geo-coords
   needing a map).
2. The default display is technically correct but visually wrong
   (e.g. a `status` enum needing colored badges).
3. You need to compose multiple fields into one widget (rare; usually
   `showWhen` is enough).

Workflow:

```ts
// 1. Build the component using @modern-admin/ui primitives.
import { Button, Badge, Card } from '@modern-admin/ui'

export function StatusBadge(props: PropertyDisplayProps) {
  const color = props.record.params.status === 'paid' ? 'green' : 'red'
  return <Badge variant={color}>{props.record.params.status}</Badge>
}

// 2. Register on the frontend componentLoader.
componentLoader.add('StatusBadge', StatusBadge)

// 3. Reference by name in resource options.
properties: {
  status: { components: { list: 'StatusBadge', show: 'StatusBadge' } },
}
```

Components must be **i18n-unaware** — accept a `labels?: { … }` prop
with English defaults. Translation happens in the `packages/react`
wrapper, not inside the UI component.

Always prefer composition of `@modern-admin/ui` primitives
(`Button`, `Badge`, `Card`, `Dialog`, `Sheet`, `Tabs`, `Select`,
`Combobox`, `Field`, `DataTable`) over raw HTML/CSS. They already
follow Tailwind 4 conventions, dark-mode tokens, and shadcn variants.
Pair every `border` className with an explicit color
(`border border-border`) — in Tailwind 4 `border` alone falls back to
`currentColor`.

---

## 10. Hooks vs. custom actions vs. handlers

| Need                                       | Use                          |
|--------------------------------------------|------------------------------|
| Add `updatedBy` on every edit              | `Before('edit')` hook        |
| Send welcome email after signup            | `After('new')` hook          |
| Validate cross-field invariant pre-save    | `Before('edit')` + throw `ValidationError` |
| Add a button "Send invoice" per row        | Custom `record` action       |
| Replace built-in delete with soft delete   | Override `actions.delete.handler` |
| Background job (slow, retryable)           | Enqueue via `@modern-admin/queue`, return immediately |
| Cross-table aggregation                    | Custom resource action, not a hook |

Hooks must be **idempotent** — they may run on retries.

---

## 11. Auth — what to wire and what NOT to wire

`@modern-admin/auth-better-auth` is the only supported auth provider.
Better Auth is already mounted by the scaffold. The agent's job:

- Enable the login strategies the host project needs (email/password,
  OAuth, passkey, magic link) in `src/auth.ts`.
- Add `plugins: [admin({...}), apiKey({...})]` to Better Auth — these
  power role gating and machine-to-machine access. **The `admin()`
  plugin is mandatory if you use `rolesResourceId`** — see §11e.
- Never re-implement login pages, sessions, or password hashing.
- Never invent custom JWT logic — Better Auth + cookie session is
  the path.

API keys for headless access:

```ts
import { apiKey } from '@better-auth/api-key'

plugins: [
  apiKey({
    apiKeyHeaders: 'x-api-key',
    requireName: true,
    enableSessionForAPIKeys: true,
    schema: { apikey: { modelName: 'MaApiKey' } },
  }),
]
```

Note `modelName: 'MaApiKey'` (PascalCase Prisma model), not the
physical table `ma_api_key`. The `@@map` directive handles the rename.

### 11a. Wiring `BetterAuthProvider` — the `as never` cast is mandatory

Better Auth 1.6+ declares `api.verifyApiKey(...)` as returning
`Promise<Response>` (raw web Response object). Our `BetterAuthInstance`
interface in `@modern-admin/auth-better-auth` declares the structured
return `{ valid, error, key }` that the api-key plugin actually
produces at runtime. The two are not nominally compatible at the type
level — even though they line up at runtime — so TypeScript will
reject the bare construction with **TS2322**:

```ts
// ❌ TS2322: Type 'Auth<...>' is not assignable to type 'BetterAuthInstance'.
//    Types returned by 'api.verifyApiKey(...)' are incompatible …
new BetterAuthProvider({ auth })
```

**Cast through `as never`** — this is what the reference apps do
(`apps/_shared/src/admin/build-auth-provider.ts:23`):

```ts
import { BetterAuthProvider } from '@modern-admin/auth-better-auth'
import { auth } from './auth.js'

const authProvider = new BetterAuthProvider({ auth: auth as never })
```

Same `as never` cast applies to `buildApiKeyService(authProvider)`,
`apiKeyService` wiring, etc.

### 11b. Wiring `RedisCacheProvider` — pass a `client`, not a URL

`RedisCacheOptions` expects a Redis-like **client object**
(`packages/cache-redis/src/index.ts`), not a connection string:

```ts
// ❌ TS2353: Object literal may only specify known properties,
//    and 'url' does not exist in type 'RedisCacheOptions'.
new RedisCacheProvider({ url: process.env.REDIS_URL })
```

Construct an `ioredis` client and pass it as `client`. For pub/sub
invalidation you also need a dedicated `subscriber` client (ioredis
won't multiplex pub/sub on a connection that's also serving commands):

```ts
import Redis from 'ioredis'
import { RedisCacheProvider } from '@modern-admin/cache-redis'

const cacheProvider = process.env.REDIS_URL
  ? new RedisCacheProvider({
      client:     new Redis(process.env.REDIS_URL),
      subscriber: new Redis(process.env.REDIS_URL),
    })
  : undefined
```

Same constructor pattern for `RedisRealtimeBus` in
`@modern-admin/realtime`. The cache and bus may share the *command*
client but must each have their own *subscriber*.

### 11c. Serving the SPA — `ModernAdminStaticUiModule` is REQUIRED

Mounting the REST API at `/admin/api/*` is **not enough**. Without an
SPA mount, hitting `/admin` returns `404 Not Found` and a hard refresh
of any in-app route (e.g. `/admin/resources/users`) also 404s — the
exact symptom users report as "main page redirects to `/` but a refresh
breaks". The canonical scaffold imports `ModernAdminStaticUiModule`
from `@modern-admin/nest` and serves the prebuilt `@modern-admin/web`
bundle alongside the API:

```ts
// src/app.module.ts (or admin.module.ts — either works)
import { ModernAdminStaticUiModule } from '@modern-admin/nest'

@Module({
  imports: [
    AdminModule,
    ModernAdminStaticUiModule.forRoot({
      path: '/admin',                        // must match the API prefix root
      title: 'Acme Admin',
      runtimeConfig: {
        apiUrl: '',                          // same-origin — relative URLs
        credentials: 'include',
        // authBasePath: '/admin/api/auth',  // default; override only if you
                                             // mount Better Auth elsewhere
      },
    }),
  ],
})
export class AppModule {}
```

The module installs an Express middleware that:
- streams `assets/*` directly from `@modern-admin/web/dist/standalone/`,
- rewrites the build's relative `./assets/...` to absolute
  `${path}/assets/...` so deep links survive, and
- serves the SPA shell with `window.__MODERN_ADMIN__` injected from
  `runtimeConfig` for **every** unknown sub-path under `${path}` —
  i.e. browser-history routes like `/admin/resources/users/edit/<id>`
  refresh cleanly instead of 404-ing.

The middleware *excludes* `${path}/api/*` so the regular admin REST
controllers keep handling API traffic.

### 11d. Mounting Better Auth — use `createBetterAuthMiddleware`, not bare `toNodeHandler`

`toNodeHandler(auth)` is greedy: it intercepts **every** path under its
mount prefix and returns its own `404` for paths it doesn't own. When
mounted at `/admin/api/auth` this shadows three NestJS endpoints that
`@modern-admin/nest`'s `AuthController` owns:

| path | owner |
|------|-------|
| `POST /admin/api/auth/login` | `AuthController` — records login event, returns session |
| `GET  /admin/api/auth/me` | `AuthController` — session bootstrap for the SPA |
| `GET  /admin/api/auth/ui-props` | `AuthController` — public auth config for the SPA |

A bare `app.use('/admin/api/auth', toNodeHandler(auth))` causes
`POST /admin/api/auth/login 404` — Better Auth handles it first and
returns its own 404 before NestJS sees the request.

**Always use `createBetterAuthMiddleware` instead:**

```ts
import { toNodeHandler } from 'better-auth/node'
import { createBetterAuthMiddleware } from '@modern-admin/nest'

// main.ts — BEFORE any body parser:
app.use('/admin/api/auth', createBetterAuthMiddleware(toNodeHandler(auth)))
```

`createBetterAuthMiddleware` wraps the given handler and calls `next()`
for `/me`, `/login`, and `/ui-props`, letting NestJS handle those three
paths while routing everything else (sign-in, sign-out, session, etc.)
to Better Auth.

#### `authBasePath` — only override when Better Auth lives elsewhere

The SPA's sign-in form posts to `${authBasePath}/sign-in/email`. The
default `authBasePath` is `/admin/api/auth`, matching the canonical
scaffold where `main.ts` does
`app.use('/admin/api/auth', createBetterAuthMiddleware(auth))`
and `auth.ts` sets `betterAuth({ basePath: '/admin/api/auth' })`.
As long as those three values agree, you do not have to set anything.

Override `authBasePath` when — and only when — you intentionally mount
Better Auth at a non-default path (e.g. you're embedding the admin
inside a host app that already owns `/api/auth/*` for end-user auth):

```ts
ModernAdminStaticUiModule.forRoot({
  path: '/admin',
  runtimeConfig: {
    authBasePath: '/api/auth',  // host already owns this — share the handler
  },
})
```

If you change the auth basePath, change all three coordinated values:
- `app.use(<basePath>, createBetterAuthMiddleware(toNodeHandler(auth)))` in `main.ts`,
- `betterAuth({ basePath: <basePath> })` in `auth.ts`,
- `runtimeConfig.authBasePath: <basePath>` in the SPA mount.

A mismatch surfaces as `POST /api/auth/sign-in/email 404 Not Found` on
login — the SPA points at the default while the server moved.

### 11e. The `admin()` plugin is mandatory for role gating

`BetterAuthProvider.getCurrentUser()` reads `currentAdmin.role` from
`session.user.role`. That field is **only** populated when Better
Auth's `admin()` plugin is mounted. Without it the session payload
has no `role`, and any of the following silently breaks:

- `rolesResourceId` permission gate — the role lookup gets `undefined`
  and the gate falls through to the fail-open branch (or denies,
  depending on action defaults).
- Per-action `isAccessible: ({currentAdmin}) => currentAdmin?.role === 'admin'`
  predicates — always evaluate to `false`, returning **403 Forbidden**
  on every protected action, even for users whose `ma_user.role`
  column is set to `'admin'` in the database.
- `/admin/api/auth/me` — `user.role` is missing from the response, so
  the SPA's permission hint layer hides nothing (UI shows actions the
  server will then 403 on).

The trap is that the database column *is* populated — `ma_user.role`
will read `'admin'` via Prisma, and the `admins` resource in the
panel renders it correctly. So the bug looks like "permissions are
wrong" when it is in fact "the session never carries the role at
all". A direct DB write (e.g. `prisma.maUser.update({ data: { role:
'admin' }})`) bypasses the plugin and gives you exactly this state.

**Always mount `admin()` when you use `rolesResourceId` or any role
predicate:**

```ts
import { betterAuth } from 'better-auth'
import { apiKey } from '@better-auth/api-key'
import { admin } from 'better-auth/plugins'

export const auth = betterAuth({
  // … database, baseURL, modelNames …
  plugins: [
    apiKey({ /* … */ }),
    admin({
      // 'admin' is convenient for demos so the seeded user can do
      // everything; use 'user' (or your equivalent) in production.
      defaultRole: process.env.DEMO_ADMIN_ROLE ?? 'user',
    }),
  ],
})
```

Reference: `apps/api-prisma/src/auth.ts` mounts the plugin via
`extraPlugins:` on `buildBetterAuth()`.

### 11f. `BigInt` columns survive serialisation by default

Prisma surfaces `BigInt` columns as native `bigint`. The framework
normalises those to decimal strings at the `BaseRecord.toJSON()`
boundary, so every list/show response is JSON-stringifiable
end-to-end — both the Express response writer and
`@modern-admin/cache-redis` accept records carrying `BigInt` fields
without throwing `TypeError: JSON.stringify cannot serialize BigInt`.
No host-side workaround is needed.

The frontend therefore receives `BigInt` columns as **strings**. If a
custom UI cell needs numeric maths, parse with `BigInt(str)` (or
`Number(str)` when the value provably fits in `Number.MAX_SAFE_INTEGER`).
Do not patch `BigInt.prototype.toJSON` globally — the framework
already handles this at the right layer.

---

## 12. i18n — translation boundary

When you add **any** new visible string:

1. Add the key to `packages/i18n/src/locales/en.ts` (source of truth).
2. Mirror it to all other locales: `de`, `es`, `fr`, `it`, `ja`, `pl`,
   `pt-BR`, `ru`.
3. Add a `labels` prop (or single named prop) on the UI component
   with English fallback defaults.
4. Wire `t('namespace:key')` in the `packages/react` call site and
   pass through `labels`.

Templates use `{placeholder}` syntax and are replaced at the component
level: `l.uploadingFile.replace('{name}', uploadingName)`.

`packages/ui` components must remain i18n-unaware. If you find
yourself importing `useI18n` inside `packages/ui` you have it wrong.

---

## 13. Database identity — UUID v7

```ts
import { uuidv7 } from '@modern-admin/core'

await prisma.maUser.create({
  data: { id: uuidv7(), email, name, /* … */ },
})
```

Do not rely on Prisma `@default(uuid(7))` — different Prisma versions
generate v4 even with `uuid(7)` specified in older clients. Always
generate in app code.

UUID v7 is time-ordered, so list pagination by `id` (or by
`createdAt`) returns newest-first cheaply. Use the id as the cursor
when paginating large lists.

---

## 14. Cache and realtime

- Default `NoopCacheProvider` is fine for single-replica deployments.
- For multi-replica: pass `cache: new RedisCacheProvider(redis)` AND
  `realtime: new RedisRealtimeBus(redis)` so cache-invalidation
  events propagate across pods.
- The admin frontend subscribes to the realtime channel and live-
  refreshes list/show pages on remote edits — no code from the agent
  required, just wire the bus.

---

## 15. Anti-patterns — do NOT

- Do not modify files under `node_modules/@modern-admin/*` — vendor it
  properly or open an issue.
- Do not hardcode `Russian/English text` in components.
- Do not call `prisma.client.$transaction` from inside an action
  handler unless you also call `BaseRecord.errors` accounting — the
  framework's error mapper expects flat `params` with dotted paths.
- Do not store an arbitrary file on local disk in production — use
  `S3UploadProvider` (signed URLs supported via `signed: true`).
- Do not run `prisma migrate dev` against a shared production
  database from a developer laptop. Migrations run from CI only.
- Do not set `isVisible: false` and assume the data is hidden — it is
  only hidden from the UI. Use `isAccessible: false` for actual
  redaction.
- Do not use `crypto.randomUUID()`. UUID v7 only.
- Do not introduce `npm`/`yarn`/`pnpm` scripts. bun only.
- **Do not add a second Prisma `generator` to a host project's
  `schema.prisma`** just to produce an ESM client for admin-service.
  See §2.5 — one schema, one client, ESM/CJS interop is bun's job.
- **Do not write body-less resource classes** (`export class FooResource {}`).
  Always `extends AdminController<Row>`, even if you have no hooks
  today — you will tomorrow.
- **Do not skip the source registry** by calling
  `prismaSource('Model')` directly from a resource decorator. Always
  go through `adminSource('logical-id')` registered in
  `admin-sources.ts`. Without the registry, FK→reference resolution
  breaks and the resource cannot be reused under another adapter.
- **Do not forget `relatedResources`.** Every reverse relation
  (`Foo[]` or `Foo?` on the parent side) is a candidate for a tab on
  the show page; skip only after a deliberate decision.
- **Do not confuse `guard:` with a permission name.** `guard` is the
  i18n key of a confirm-dialog string (`'confirmDeleteApp'`), not a
  capability id. Permission gating is `isAccessible:` (or the role
  matrix). See §6c.
- **Do not write code-pinned `isAccessible` that just checks
  `currentAdmin?.role`.** That is exactly what the `MaRole`
  permissions matrix exists for — see §6a. Code-pinned `isAccessible`
  is for invariants no role may bypass.
- **Do not inline the action context type.** Always import
  `ActionContext` (or `AdminActionContext<Row>`) from
  `@modern-admin/core` / `@modern-admin/nest`. An inline
  `({ currentAdmin }: { currentAdmin?: { role?: string } })` strips
  `record`/`records`/`cache`/`admin` from autocomplete and rots
  on every API change.
- **Do not use the `actions:` key inside `@AdminResource({...})`.** The
  NestJS decorator type is `Omit<ResourceOptions, 'actions'>` —
  TypeScript will reject it (`TS2353: ... 'actions' does not exist in
  type 'AdminResourceMeta'`). All action config in NestJS style goes
  through `@Action(...)`, `@Before(...)`, `@After(...)` method
  decorators, or — for role gating — through `MaRole.permissions`.
  See §6b–§6d.
- **Do not ship a transactional resource without any custom
  `@Action`.** If the domain spec contains verbs like *approve*,
  *publish*, *regenerate*, *retry*, *discard*, *send*, *archive*,
  every one of them is a `@Action({ actionType: 'record' | 'bulk' |
  'resource' })` method on the controller.
- **Do not repeat `isVisible: { list: true }` etc.** `true` is the
  default for every flag — overriding it just adds noise. Only
  override when flipping to `false`.
- **Do not stuff long text columns into `listProperties`.** A
  `text`/`textarea`/`richtext` column in the list view destroys the
  table layout. Either omit it from `listProperties` (show only on
  `show`/`edit`) or render a truncated `components.list` cell.
- **Do not override a base-class method with a mismatched
  signature.** `delete() {}` (`() => void`) is NOT assignable to
  `AdminController<TRow>.delete: (ctx) => Promise<RecordActionResponse>`
  and emits `TS2416`. Either return `Promise<never>` (for stubs that
  always throw) or use `override async delete(ctx: DeleteContext<Row>):
  Promise<RecordActionResponse> { return super.delete(ctx) }`
  (to wrap the default with `guard:`/`isVisible:`). See §6d.
- **Do not construct `new BetterAuthProvider({ auth })` without
  `as never`.** Better Auth 1.6+'s `api.verifyApiKey` return type
  (`Promise<Response>`) does not match our interface's structured
  return — TypeScript rejects the bare assignment. Cast: `{ auth:
  auth as never }`. See §11a.
- **Do not pass `url` to `RedisCacheProvider`.** `RedisCacheOptions`
  takes `client` (a Redis-like object), not a connection string.
  Construct ioredis yourself: `new Redis(process.env.REDIS_URL)`.
  See §11b.
- **Do not skip `ModernAdminStaticUiModule`.** Mounting only the REST
  API leaves `/admin` (and every SPA deep link refresh) returning
  `404 Not Found`. Always import
  `ModernAdminStaticUiModule.forRoot({ path: '/admin', … })` next to
  `AdminModule`. See §11c.
- **Do not use bare `toNodeHandler(auth)` at the `/admin/api/auth`
  prefix.** `toNodeHandler` is greedy — it returns its own 404 for any
  path it doesn't own, shadowing `AuthController`'s `/login`, `/me`,
  and `/ui-props` before NestJS can handle them. Always wrap it with
  `createBetterAuthMiddleware(toNodeHandler(auth))` from
  `@modern-admin/nest`. See §11d.
- **Do not hardcode `/api/auth/...` in the SPA mount.** The default
  `authBasePath` in `runtimeConfig` is `/admin/api/auth` and matches the
  canonical scaffold's
  `app.use('/admin/api/auth', createBetterAuthMiddleware(toNodeHandler(auth)))`.
  If `main.ts` mounts Better Auth at one path and the SPA's
  `authBasePath` resolves to a different one, login posts to a
  non-existent endpoint and the browser shows
  `POST /api/auth/sign-in/email 404`. Keep `main.ts`, `auth.ts`'s
  `basePath`, and `runtimeConfig.authBasePath` in lockstep. See §11d.
- **Do not patch `BigInt.prototype.toJSON` globally** to "fix"
  `TypeError: JSON.stringify cannot serialize BigInt`. The framework
  normalises `BigInt` columns to decimal strings inside
  `BaseRecord.toJSON()` — every list/show response is already
  JSON-safe. See §11f.
- **Do not omit `admin()` plugin** from Better Auth when you use
  `rolesResourceId` or any `currentAdmin?.role` predicate. The plugin
  is what attaches `role` to the session; without it
  `currentAdmin.role` is always `undefined` (even when `ma_user.role`
  is `'admin'` in the database) and every role-gated action returns
  **403 Forbidden**. Add `admin({ defaultRole: '…' })` from
  `better-auth/plugins` alongside `apiKey({...})`. See §11e.
- **Do not cherry-pick the `Ma*` schema fragment.** `setupPrismaSystem`
  resolves all 14 delegates eagerly on boot and throws
  `[modern-admin/system-prisma] missing delegate "prisma.maWebhook"`
  (or `maAiTask`, `maWebhookDelivery`, `maAiTaskEvent`) the moment the
  module loads. Typecheck stays green because the lookup is dynamic
  (`prisma[name]`) — only a real start exposes the gap. Always copy
  ALL fourteen `Ma*` models from
  `packages/system-prisma/prisma/modern-admin.prisma`: `MaUser`,
  `MaSession`, `MaAccount`, `MaVerification`, `MaApiKey`, `MaRole`,
  `MaLog`, `MaWebhook`, `MaWebhookDelivery`, `MaConfig`, `MaHistory`,
  `MaAiTask`, `MaAiTaskEvent`, `MaCache`. See §2.5 for the verification
  `grep` command.

---

## 16. Verification checklist before "done"

After integrating Modern Admin into a host project, confirm:

- [ ] `bun run dev` (or `scripts/dev.sh start api-prisma web`) starts
      cleanly; logs in `.dev-logs/` show no errors.
- [ ] The seed admin can log in at `/admin` and see every registered
      resource in the sidebar.
- [ ] Every sensitive column (`password`, `apiKey`, …) is absent from
      both the JSON response and the rendered UI.
- [ ] Every destructive action (`delete`, `bulkDelete`, custom
      "archive") has a `guard:` confirmation and an `isAccessible`
      role check.
- [ ] Every new visible string exists in all 9 locale files.
- [ ] `bun run typecheck` is green for the whole workspace.
- [ ] Tests added for every custom hook, custom action handler, and
      custom UI component (`bun test`).
- [ ] Mobile viewport (375px) renders the new resource's list, show,
      and edit pages without horizontal page scroll.

---

## 17. Reference index — where to look

- **Canonical resource controller** —
  `apps/_shared/src/admin/posts/posts.controller.ts` (hooks + record
  + bulk actions) and
  `apps/_shared/src/admin/customers/customers.controller.ts`
  (`passwordsFeature` + `aiFillFeature` + custom action).
  Read these BEFORE writing a new resource.
- **Canonical source registry** — `apps/_shared/src/admin/source-registry.ts`.
- **Canonical Prisma source factory** —
  `apps/api-prisma/src/admin-sources.ts` (logical-id mapping +
  relation field rewriting).
- **Canonical admin module wiring** — `apps/api-prisma/src/admin.module.ts`.
- Resource options schema — `packages/core/src/decorators/resource-options.ts`.
- Property options schema — `packages/core/src/decorators/property-options.ts`.
- Action options schema — `packages/core/src/decorators/action-options.ts`
  (especially: `guard` is a confirm-dialog i18n key, not a permission).
- `ActionContext` / `CurrentAdmin` types —
  `packages/core/src/actions/action.ts` and
  `packages/core/src/ports/current-admin.ts`. Use these in every
  `isAccessible`/`isVisible` callback.
- NestJS decorators (including `AdminController`, `@Before`, `@After`,
  `@Action`) — `packages/nest/src/admin/decorators.ts`.
- Built-in action handlers — `packages/core/src/actions/*.ts`.
- Permissions logic — `packages/core/src/modern-admin.ts` (`getRolePermissions`, `invoke`).
- Upload providers — `packages/feature-upload/src/providers/`.
- UI primitives — `packages/ui/src/components/`.
- Full architectural overview — `apps/docs/content/en/docs/architecture.md`.

When in doubt, read the source — every public export has a JSDoc
block explaining its contract.
