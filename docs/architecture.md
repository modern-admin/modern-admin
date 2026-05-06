---
title: Architecture
description: Package layout and the data flow through ModernAdmin.invoke().
---

# Architecture

## Layered packages

```
@modern-admin/core             — abstractions: BaseDatabase, BaseResource,
                                  BaseProperty, BaseRecord, decorators,
                                  built-in actions, ports
@modern-admin/nest             — NestJS dynamic module, REST controllers
                                  (`/admin/api/resources/:id/actions/*`),
                                  cache interceptor, auth guard
@modern-admin/graphql          — code-first GraphQL schema generation +
                                  Apollo wiring
@modern-admin/realtime         — WebSocket gateway + IRealtimeBus
@modern-admin/react            — React provider, hooks, default <AdminApp />
@modern-admin/ui               — shadcn/ui primitives + theme tokens
@modern-admin/adapter-prisma   — Prisma 7 adapter
@modern-admin/adapter-drizzle  — Drizzle 0.45 adapter
@modern-admin/auth-better-auth — Better Auth IAuthProvider implementation
@modern-admin/cache-redis      — Redis-backed ICacheProvider
@modern-admin/i18n             — translation registry + 9 locales
@modern-admin/tsconfig         — shared TypeScript presets
create-modern-admin            — project scaffolder
```

The cardinal rule: **`packages/core` knows nothing about specific ORMs,
transports, or UI libraries**. It defines abstract classes and ports;
adapters and transports plug into them.

## Data flow

Every request — REST, GraphQL, WebSocket — converges on
`ModernAdmin.invoke(actionName, request)`:

```
HTTP/GraphQL request
       │
       ▼
NestJS controller / GraphQL resolver
       │
       ▼
ModernAdmin.invoke(action, { resourceId, recordId, params, currentAdmin })
       │
       ├─→ resolveResource()         (find decorated resource)
       ├─→ action.isAccessible()     (auth/visibility check)
       ├─→ action.before(request)    (pre-hooks)
       ├─→ action.handler(ctx)       (actual ORM call via adapter)
       ├─→ action.after(response)    (post-hooks)
       ├─→ realtime.publish(event)   (mutation events → WS clients)
       └─→ cache.invalidateTag(...)  (on mutations)
       │
       ▼
Response (records, record, total, etc.)
```

This single funnel is why REST + GraphQL stay in sync: both transports call
the same actions with the same context shape. Adding a new transport
(tRPC, JSON-RPC, …) is a thin wrapper around `invoke()`.

## Ports

Pluggable behaviors are expressed as **ports** — interfaces with default
no-op implementations that real packages override:

| Port              | Default        | Real implementation                |
| ----------------- | -------------- | ---------------------------------- |
| `ICacheProvider`  | `NoopCache`    | `@modern-admin/cache-redis`        |
| `IAuthProvider`   | `AnonymousAuth`| `@modern-admin/auth-better-auth`   |
| `IRealtimeBus`    | `NoopRealtimeBus` / `InMemoryRealtimeBus` | `RedisRealtimeBus` |
| `IComponentLoader`| client-only    | `@modern-admin/react`              |

Apps wire concrete implementations at `ModernAdminModule.forRoot()`.

## Adapter contract

Adapters implement `BaseDatabase` (which yields a list of `BaseResource`
instances) and `BaseResource` (CRUD + introspection). The full surface is
small: `count`, `find`, `findOne`, `findMany`, `create`, `update`, `delete`,
plus `properties()` for schema metadata. Optional `streamFind` /
`aggregate` / `transaction` hooks unlock cursor pagination, GraphQL
aggregations, and atomic bulk operations.

See [Adapters](./adapters.md) for the full guide.

## Phased delivery

The plan delivers value in 9 phases:

| Phase | Status | Scope |
| --- | --- | --- |
| 0 | done | Bootstrap (workspaces, tsconfig, lint, docker-compose) |
| 1 | done | Core abstractions in `@modern-admin/core` |
| 2 | done | Prisma adapter |
| 3 | done | NestJS module + REST + Better Auth |
| 4 | done | GraphQL transport + subscriptions |
| 5 | done | Frontend (TanStack Start + shadcn) |
| 6 | done | Drizzle adapter |
| 7 | done | Realtime WS |
| 8 | in progress | CLI, docs, theming, i18n, e2e |
