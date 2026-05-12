---
title: History
description: historyFeature / historyPlugin — full-snapshot revision tracking with field-level diffs and revert.
---

# History — `@modern-admin/feature-history`

Tracks record changes with full before/after snapshots and field-level diffs, enabling
audit trails and one-click revert to any previous state.

---

## How it works

- Installs `before` hooks on `edit` and `delete` to capture pre-change state
- Installs `after` hooks on `new`, `edit`, `delete` to write revision entries
- Computes field-level diffs using `computeFieldDiff()` from core
- Stores snapshots in an `IHistoryStore` implementation

---

## Installation

```sh
bun add @modern-admin/feature-history
# Pick a store implementation:
bun add @modern-admin/system-prisma   # Prisma store
bun add @modern-admin/system-drizzle  # Drizzle store
```

---

## Global plugin (recommended)

Apply history tracking to multiple resources at once:

```ts
import { historyPlugin } from '@modern-admin/feature-history'
import { PrismaHistoryStore } from '@modern-admin/system-prisma'

ModernAdminModule.forRoot({
  plugins: [
    historyPlugin({
      store: new PrismaHistoryStore(prisma),
      actions: ['new', 'edit', 'delete'],    // default
      excludeFields: ['updatedAt', 'updatedBy'],  // skip in diff
      include: ['users', 'posts'],           // only these resources
      exclude: ['sessions'],                 // skip these resources
      userIdResolver: (admin) => admin?.id,  // custom user id resolver
    }),
  ],
})
```

### Options reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `store` | `IHistoryStore` | — | Where to persist revisions |
| `actions` | `string[]` | `['new','edit','delete']` | Which actions to track |
| `excludeFields` | `string[]` | `[]` | Fields to skip in diffs |
| `include` | `string[]` | all | Whitelist of resource ids |
| `exclude` | `string[]` | none | Blacklist of resource ids |
| `userIdResolver` | `(admin) => string` | `admin?.id` | Custom actor id extractor |

---

## Per-resource variant

```ts
import { historyFeature } from '@modern-admin/feature-history'

{
  resource: PostsResource,
  features: [
    historyFeature({
      store: historyStore,
      actions: ['edit'],  // only track edits for this resource
    }),
  ],
}
```

---

## Store implementations

### PrismaHistoryStore

```ts
import { PrismaHistoryStore } from '@modern-admin/system-prisma'

const historyStore = new PrismaHistoryStore(prisma)
```

Requires the `AdminRevision` model in your Prisma schema. Use `modern-admin generate`
to append it automatically.

### DrizzleHistoryStore

```ts
import { DrizzleHistoryStore } from '@modern-admin/system-drizzle'

const historyStore = new DrizzleHistoryStore(db, schema)
```

### Custom store

Implement `IHistoryStore`:

```ts
interface IHistoryStore {
  save(entry: HistoryEntry): Promise<void>
  list(query: HistoryQuery): Promise<HistoryEntry[]>
  get(id: string): Promise<HistoryEntry | null>
}
```

---

## REST API

The history endpoints are automatically registered when `historyStore` is configured
in `ModernAdminModule.forRoot()`:

```http
GET  /admin/api/resources/:id/records/:recordId/history
GET  /admin/api/resources/:id/records/:recordId/history/:revisionId
POST /admin/api/resources/:id/records/:recordId/history/:revisionId/revert
```

See the [API](../api/rest) page for full endpoint documentation.

---

## UI

History appears as a **Revisions** tab on the show page for each tracked resource.
Each revision shows:

- Timestamp and actor
- Field-level diff (before → after, colour-coded)
- Revert button (calls the revert endpoint via `invoke('edit')`)

---

## What it gives you

- Complete audit trail of who changed what and when
- Field-by-field diff for each revision
- Ability to restore previous record states via UI or API
- Configurable field exclusion (skip noisy timestamps)
- Resource-level scoping via `include` / `exclude`
