---
title: GraphQL
description: Auto-generated schema, subscriptions, and DataLoader integration.
---

# GraphQL

`@modern-admin/graphql` builds a code-first GraphQL schema dynamically
from your decorated resources at boot time and serves it through Apollo
Server inside NestJS.

## What you get

For every resource named `users`, the schema exposes (resource id is
used verbatim as the GraphQL type/field prefix):

```graphql
type Users { id: ID! email: String name: String ... }

type Query {
  usersList(filter: JSON, sort: String, skip: Int, take: Int): [Users!]!
  usersOne(id: ID!): Users
  usersCount(filter: JSON): Int!
}
```

Property types map automatically: scalars to Int/Float/String/Boolean,
dates to `DateTime` (custom scalar), references to the related resource's
GraphQL type with DataLoader-backed resolvers (no N+1). Mutations and
subscriptions land in a future iteration; for writes use the REST
controllers, which share the same `ModernAdmin.invoke()` pipeline so
authorization and hooks behave identically.

## Wiring it up

```ts
import { ModernAdminGraphqlModule } from '@modern-admin/graphql'

@Module({
  imports: [
    ModernAdminModule.forRoot({ databases: [...], resources: [...] }),
    ModernAdminGraphqlModule.forRoot(),
  ],
})
export class AppModule {}
```

The default endpoint is `/admin/graphql`. The module reuses the same
`ModernAdmin` instance the REST controllers do, so a single configuration
drives both transports.

The GraphQL module reads the same `ModernAdmin` instance the REST module
uses, so REST and GraphQL stay perfectly synchronized — both call
`ModernAdmin.invoke()` under the hood.

## Subscriptions over Redis

Subscriptions ride the `IRealtimeBus` configured for the app. With the
Redis bus wired in, every API instance fans out events to its subscribed
GraphQL clients:

```graphql
subscription {
  userChanged(kind: [CREATED, UPDATED]) {
    kind
    record
    at
  }
}
```

Authentication context is propagated from the WebSocket connection
through the same `IAuthProvider` used by HTTP queries.

## DataLoader

Reference fields are resolved via per-request DataLoaders keyed by the
target resource id, so a query like:

```graphql
query {
  postList(take: 50) { records { id, title, author { email } } }
}
```

issues a single batched lookup against the `User` adapter, regardless of
how many distinct authors appear in the result set.
