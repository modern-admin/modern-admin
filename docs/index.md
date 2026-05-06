---
title: Modern Admin
description: Universal admin panel framework — NestJS + TanStack Start + shadcn.
---

# Modern Admin

Modern Admin is an AdminJS-style admin panel framework, rebuilt from the ground
up on the modern TypeScript stack:

- **NestJS 11** for the backend (REST + GraphQL + WebSocket).
- **TanStack Start + React 19 + shadcn/ui + Tailwind 4** for the frontend.
- **Prisma 7** and **Drizzle 0.45** as plug-in ORM adapters; you can write
  your own.
- **Better Auth 1.6+** for authentication (sessions, OAuth, passkeys).
- **Redis** for cross-instance cache and realtime fan-out.
- **Zod 4** for end-to-end runtime validation.

The project is structured as a [Bun] workspace monorepo and ships as a set of
focused packages under the `@modern-admin/*` scope.

## Why another admin framework?

AdminJS pioneered the "describe a resource, get a CRUD UI" model but sits on
an aging stack: legacy bundling, custom design system, no GraphQL, weak
caching, hardcoded UX choices. Modern Admin keeps the parts that worked
(adapters, decorators, ports, the action pipeline) and rebuilds the rest on
current libraries — without locking you into any single ORM, transport, or
UI implementation.

## Status

The framework is in active development. Phases 0–7 are complete; Phase 8
(polish) is in progress. See the [implementation roadmap](./architecture.md)
for details.

## Where to next

- **[Getting started](./getting-started.md)** — scaffold a project and wire
  up your first resource.
- **[Architecture](./architecture.md)** — the layered package layout and the
  data flow through `ModernAdmin.invoke()`.
- **[Adapters](./adapters.md)** — write your own ORM adapter or use the
  bundled Prisma / Drizzle ones.
- **[Authentication](./auth.md)**, **[Cache](./cache.md)**,
  **[Realtime](./realtime.md)**, **[Frontend](./frontend.md)**.

[Bun]: https://bun.sh
