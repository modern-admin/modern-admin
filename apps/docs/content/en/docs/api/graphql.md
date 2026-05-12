---
title: GraphQL API
description: Auto-generated GraphQL schema, naming conventions, DataLoader reference resolvers, and schema extensions.
---

# GraphQL API

`@modern-admin/graphql` builds a code-first GraphQL schema dynamically from your
registered resources at boot time and serves it through Apollo Server inside NestJS.
Both GraphQL and [REST](./rest) share the same `ModernAdmin.invoke()` pipeline so
access checks, hooks, cache invalidation, and realtime events are identical.

---

## Setup

```ts
// app.module.ts
import { Module } from '@nestjs/common'
import { ModernAdminModule } from '@modern-admin/nest'
import { ModernAdminGraphqlModule } from '@modern-admin/graphql'

@Module({
  imports: [
    ModernAdminModule.forRoot({ ... }),
    ModernAdminGraphqlModule.forRoot({
      sandbox: true,   // serve Apollo Sandbox at /admin/graphql/sandbox (default true)
    }),
  ],
})
export class AppModule {}
```

Install peer dependencies:

```sh
bun add @modern-admin/graphql graphql dataloader
```

---

## Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/admin/graphql` | Execute a query or mutation |
| `GET` | `/admin/graphql` | Hint page (status: ok) |
| `GET` | `/admin/graphql/sandbox` | Apollo Sandbox UI (when `sandbox: true`) |

The `POST` endpoint accepts standard GraphQL JSON:

```json
{
  "query": "query { usersList { id email } }",
  "variables": {},
  "operationName": null
}
```

Authentication is the same as REST — `x-api-key` header or session cookie.

---

## Generated schema — naming conventions

For each resource, the schema builder generates types using the **resource id**
PascalCased as the base name. For a resource id `order-items`:

| Name | Description |
|---|---|
| `OrderItems` | Output object type |
| `OrderItemsFilterInput` | Filter input for list queries |
| `OrderItemsCreateInput` | Mutation input — all non-id fields, required fields are `!` |
| `OrderItemsUpdateInput` | Mutation input — all non-id fields, all optional |

---

## Generated queries

For a resource with id `users`:

```graphql
type Query {
  # Paginated list with optional filter, sort, and limit/offset
  usersList(
    filter: UsersFilterInput
    limit: Int
    offset: Int
    sortBy: String
    sortDirection: String
  ): [Users!]!

  # Single record by primary key
  usersOne(id: ID!): Users

  # Total count matching the filter
  usersCount(filter: UsersFilterInput): Int!

  # Always present — useful for health checks
  _status: String!
}
```

Filter inputs use **string values** for all fields (the adapter normalises them):

```graphql
query {
  usersList(
    filter: { role: "admin" }
    limit: 10
    sortBy: "createdAt"
    sortDirection: "desc"
  ) {
    id
    email
    role
    createdAt
  }
}
```

---

## Generated mutations

```graphql
type Mutation {
  createUsers(input: UsersCreateInput!): Users!
  updateUsers(id: ID!, input: UsersUpdateInput!): Users!
  deleteUsers(id: ID!): Boolean!
}
```

Examples:

```graphql
mutation {
  createUsers(input: { email: "bob@example.com", role: "viewer" }) {
    id
    email
  }
}
```

```graphql
mutation {
  updateUsers(id: "01956d2e-…", input: { role: "editor" }) {
    id
    role
  }
}
```

```graphql
mutation {
  deleteUsers(id: "01956d2e-…")
}
```

---

## Custom scalars

| Scalar | Used for | Serialisation |
|---|---|---|
| `JSON` | `json`, `mixed`, `key-value` fields | Pass-through — any JSON value |
| `DateTime` | `date`, `datetime` fields | ISO-8601 string ↔ `Date` object |
| `ID` | Primary keys, FK fields | String |
| `Upload` | `file` fields (feature-upload extension) | Multipart / base64 |

---

## Reference resolvers and DataLoader

When a property has `type: 'reference'` (a FK column), the schema builder
automatically adds a companion field `<path>Ref` that resolves the related object
using a **DataLoader** (batches all FK lookups for a query into one `findMany` call
per resource):

```graphql
query {
  ordersList {
    id
    userId         # FK scalar (string ID)
    userIdRef {    # resolved Users object
      id
      email
    }
  }
}
```

DataLoaders are per-request (created fresh in `createContext()`), so there is no
cross-request data leakage.

---

## Schema extensions

Feature packages can contribute extra queries and mutations:

```ts
import { uploadGraphqlExtension } from '@modern-admin/feature-upload'

ModernAdminGraphqlModule.forRoot({
  extensions: [uploadGraphqlExtension()],
})
```

Extensions receive the shared `Upload` scalar via `ExtensionContext` so they do
not redeclare it. The schema builder throws if an extension tries to redefine an
existing field name.

---

## Apollo Sandbox

When `sandbox: true` (default), an Apollo Sandbox UI is served at
`GET /admin/graphql/sandbox`. The Sandbox UI is loaded from Apollo's CDN.
Disable it in production deployments with a strict CSP:

```ts
ModernAdminGraphqlModule.forRoot({ sandbox: false })
```

---

## Multipart uploads

The GraphQL endpoint supports the
[GraphQL multipart request spec](https://github.com/jaydenseric/graphql-multipart-request-spec)
for file uploads. When `@modern-admin/feature-upload` is installed and its GraphQL
extension is registered, upload mutations accept `Upload` scalar variables mapped
to multipart form fields.

---

## Property type → GraphQL type mapping

| Core `PropertyType` | GraphQL type |
|---|---|
| `'string'` / `'uuid'` / `'enum'` / `'richtext'` / `'password'` | `String` |
| `'number'` / `'currency'` | `Int` |
| `'float'` | `Float` |
| `'boolean'` | `Boolean` |
| `'datetime'` / `'date'` | `DateTime` (custom scalar) |
| `'json'` / `'mixed'` / `'key-value'` | `JSON` (custom scalar) |
| `'reference'` (FK) | `ID` + `<path>Ref: RelatedType` |
| `'file'` | `String` (key) + `Upload` in mutations |
| `'m2m'` | `[JSON!]` |
