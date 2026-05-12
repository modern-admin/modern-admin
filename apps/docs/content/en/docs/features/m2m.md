---
title: Many-to-many
description: m2mFeature — junction-backed many-to-many relation editors with extra field support.
---

# Many-to-many — `@modern-admin/feature-m2m`

Adds a visual multi-select editor for M2M relations backed by a real junction table,
with support for extra junction columns (timestamps, user attribution, ordering).

---

## How it works

- Creates a virtual `type: 'm2m'` property rendered as a multi-select editor
- Uses a real junction table registered as a separate resource
- Installs `after` hooks on `list` / `show` / `new` / `edit` to hydrate from junction rows
- On write: applies diff (insert new rows, update extras, delete removed rows)
- On `delete.after`: cleans up junction rows when `cascadeDelete: true`

---

## Installation

```sh
bun add @modern-admin/feature-m2m
```

---

## Configuration

```ts
import { m2mFeature } from '@modern-admin/feature-m2m'

{
  resource: PostsResource,
  features: [
    m2mFeature({
      property: 'tags',            // virtual property name
      through: 'postTags',         // junction resource id
      localKey: 'postId',          // FK to the parent (posts)
      foreignKey: 'tagId',         // FK to the related (tags)
      reference: 'tags',           // reference resource id for the picker
      extraFields: ['addedAt', 'addedBy'],  // junction columns to expose
      cascadeDelete: true,         // delete junction rows on parent delete
    }),
  ],
}
```

### Options reference

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `property` | `string` | yes | Name of the virtual M2M property |
| `through` | `string` | yes | Junction resource id |
| `localKey` | `string` | yes | FK column pointing to the parent resource |
| `foreignKey` | `string` | yes | FK column pointing to the related resource |
| `reference` | `string` | yes | Resource id of the related items (for picker UI) |
| `extraFields` | `string[]` | no | Additional junction columns to read/write |
| `cascadeDelete` | `boolean` | no | Remove junction rows when parent is deleted |

---

## Junction table schema (example)

```ts
// postTags — junction between posts and tags
{
  id: uuid           // PK
  postId: uuid       // FK → posts
  tagId: uuid        // FK → tags
  addedAt: timestamp // extra field
  addedBy: uuid      // extra field (FK → users)
}
```

The junction table must be registered as its own resource (the adapter discovers it
automatically when it exists in your schema):

```ts
ModernAdminModule.forRoot({
  databases: [{ client: db, schema }],  // postTags included in schema
})
```

---

## Value shape

The M2M property value in `record.params` is an array of objects:

```json
[
  { "tagId": "01956d2e-…", "addedAt": "2024-06-15T12:00:00.000Z" },
  { "tagId": "01956d2f-…", "addedAt": "2024-06-15T12:01:00.000Z" }
]
```

When `extraFields` is empty, the value is a plain array of foreign key strings:

```json
["01956d2e-…", "01956d2f-…"]
```

---

## GraphQL

M2M properties are exposed as `[JSON!]` on the parent type in the auto-generated
GraphQL schema. The resolver returns the same array shape as above.

---

## What it gives you

- Visual multi-select editor for M2M relations
- Automatic junction row management (insert / update / delete diff)
- Support for extra junction fields (timestamps, user attribution, ordering)
- Cascade delete option for cleanup
- Adapter-agnostic (works with Prisma, Drizzle, or any custom adapter)
- Hooks chain with other features
