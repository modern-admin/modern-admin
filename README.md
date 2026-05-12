# Modern Admin

Universal, modern, performant admin panel framework — a spiritual successor to
[AdminJS](https://adminjs.co/) built on a contemporary stack with a focus on
DX, customization, and production-grade caching.

> Status: **feature-complete MVP**. Phases 0–8 done; Phase 9 (feature
> plugins + UX refinement) is in progress. **275 unit tests** across
> 14 packages, all green. APIs may still shift before 1.0.

## Why

AdminJS pioneered an elegant adapter/decorator model for auto-generating CRUD
admin panels from ORM schemas. Modern Admin keeps that model but addresses its
weaknesses:

- Outdated UI library and styling story → **shadcn/ui + Tailwind 4**
- Weak component customization, slow runtime bundling → **Vite + dynamic
  imports, no runtime bundler**
- No built-in caching → **Redis on the backend, TanStack Query on the
  frontend, tag-based invalidation**
- No GraphQL → **REST + GraphQL in parallel over the same decorated resources**
- Limited auth → **Better Auth (OAuth, passkeys, 2FA, magic links)**
- No realtime → **NestJS WebSocket gateway with Redis pub/sub**

## Stack

| Layer            | Choice                                          |
| ---------------- | ----------------------------------------------- |
| Runtime / pm     | [Bun](https://bun.com) 1.3+                     |
| Frontend         | Vite 8 + React 19 + TanStack Router 1.x (hash) |
| UI               | shadcn/ui, Tailwind CSS 4 (CSS-first)           |
| Backend          | NestJS 11 (REST + GraphQL + WebSocket)          |
| ORMs             | Prisma 7, Drizzle 0.45                          |
| Auth             | Better Auth 1.6+                                |
| Cache            | Redis (backend) + TanStack Query 5 (frontend)   |
| Validation       | Zod 4 end-to-end                                |
| Language         | TypeScript 6 (strict)                           |

> Dependency policy: this project always pins to the latest stable release of
> each library. Code is adapted for breaking changes, not held back.

## Repository layout

```
modern-admin/
├── apps/
│   ├── web/                       — Vite + React 19 reference app
│   ├── api/                       — NestJS reference app
│   └── e2e/                       — Playwright e2e tests
├── packages/
│   ├── core/                      — @modern-admin/core (adapters, decorators, actions, ports)
│   ├── nest/                      — @modern-admin/nest (NestJS module: REST + WS bootstrap)
│   ├── graphql/                   — @modern-admin/graphql (Apollo + code-first schema)
│   ├── realtime/                  — @modern-admin/realtime (WebSocket gateway, Redis pub/sub)
│   ├── react/                     — @modern-admin/react (components, hooks, AdminClient)
│   ├── ui/                        — @modern-admin/ui (30+ shadcn primitives + themes)
│   ├── i18n/                      — @modern-admin/i18n (9 locales)
│   ├── adapter-prisma/            — @modern-admin/adapter-prisma
│   ├── adapter-drizzle/           — @modern-admin/adapter-drizzle
│   ├── auth-better-auth/          — @modern-admin/auth-better-auth
│   ├── cache-redis/               — @modern-admin/cache-redis
│   ├── feature-upload/            — @modern-admin/feature-upload (Local + S3)
│   ├── feature-logging/           — @modern-admin/feature-logging (WIP)
│   ├── create-modern-admin/       — CLI scaffolder
│   └── tsconfig/                  — shared tsconfig presets
├── docs/                          — markdown documentation
├── docker-compose.yml             — Postgres + Redis for development
└── package.json                   — bun workspaces root
```

## Architecture in one diagram

```
                        ┌─────────────────────────────────┐
                        │            Frontend             │
                        │  Vite + React 19 + shadcn/ui    │
                        │  TanStack Query (cache & WS)    │
                        └──────────────┬──────────────────┘
                                       │ HTTP / GraphQL / WS
                        ┌──────────────▼──────────────────┐
                        │      @modern-admin/nest         │
                        │  REST · GraphQL · WS Gateway    │
                        │  Auth Guard · Cache Interceptor │
                        └──────────────┬──────────────────┘
                                       │
                        ┌──────────────▼──────────────────┐
                        │      @modern-admin/core         │
                        │  ModernAdmin · ResourcesFactory │
                        │  Decorators · Actions · Filter  │
                        │  Ports: Auth · Cache · Loader   │
                        └────┬─────────┬──────────────┬───┘
                             │         │              │
            ┌────────────────▼──┐ ┌────▼────────┐ ┌───▼─────────┐
            │ adapter-prisma    │ │ adapter-    │ │ auth-       │
            │                   │ │  drizzle    │ │  better-auth│
            └───────────────────┘ └─────────────┘ └─────────────┘
```

Core defines abstractions (`BaseDatabase`, `BaseResource`, `BaseProperty`,
`BaseRecord`), decorators with Zod-validated options, an action system with
`before`/`after` hooks, and ports for auth/cache/components. Adapters and
transports plug in without leaking ORM- or framework-specific types into core.

## Getting started

Prerequisites: **Bun ≥ 1.1**, **Node 20+**, **Docker** for the dev databases.

```bash
# Install all workspaces
bun install

# Bring up Postgres + Redis
bun run docker:up

# Run reference apps (separate terminals)
bun run dev:api
bun run dev:web

# Workspace-wide checks
bun run typecheck
bun test
```

Reference API listens on `http://localhost:3001` (`/health` for a smoke check).
Reference web app on `http://localhost:5173`.

## Roadmap

- [x] **Phase 0 — Bootstrap.** Bun workspaces, package skeletons, hello-world
      apps, docker-compose for Postgres + Redis.
- [x] **Phase 1 — Core abstractions.** `BaseDatabase` / `BaseResource` /
      `BaseProperty` / `BaseRecord`, decorators with Zod schemas,
      `ResourcesFactory`, built-in actions, ports, `ModernAdmin`
      orchestrator. **45 tests**.
- [x] **Phase 2 — Prisma adapter.** DMMF-driven property inference, filter
      mapping, references. **28 tests**.
- [x] **Phase 3 — NestJS module + Better Auth.** REST controllers with
      AdminJS-shaped routes (`/admin/api/resources/:id/actions/*`), auth
      guard, cache interceptor, `forFeature` registry. **14 + 5 tests**.
- [x] **Phase 4 — GraphQL transport.** Code-first dynamic schema with
      lazy compilation via `SchemaHolder`, `/admin/graphql` endpoint.
      **9 tests**. (Mutations and subscriptions are on the Phase 9 backlog.)
- [x] **Phase 5 — Frontend core.** Vite + React 19 + shadcn, TanStack
      Router (hash history), list/show/edit/new/login pages, property
      renderers, AdminClient, optimistic updates, hotkeys. **48 tests**.
- [x] **Phase 6 — Drizzle adapter.** Schema introspection via FK symbol
      keys. **40 tests**.
- [x] **Phase 7 — Realtime.** WebSocket gateway + Redis pub/sub.
      **12 tests**.
- [x] **Phase 8 — Polish.** `create-modern-admin` CLI (**11 tests**),
      docs/* (10 pages), theming, i18n × 9 locales (**9 tests**),
      Playwright e2e, mobile-first UI, lucide icons on action buttons.
- [ ] **Phase 9 — Feature plugins & UX refinement** (in progress)
  - [x] `feature-upload` (Local + S3, NestJS controller, React FileInput).
        **27 tests**.
  - [x] Per-column filter popovers, date-range filter, reference combobox
        in filters, charcoal dark theme, `parseApiError` UI.
  - [ ] `feature-logging` (scaffold present, typecheck + tests pending).
  - [ ] GraphQL mutations + subscriptions, DataLoader for references.
  - [ ] License, npm publishing, feature docs.

Detailed plan: `/home/sergey/.claude/plans/fizzy-jumping-reef.md` (local).

## Development conventions

- Validation is Zod everywhere — option schemas, DTOs, form resolvers.
- Tests live next to packages in `<pkg>/test/` and run with `bun test`.
- Workspace test sweep: `bun --filter '*' test` (e2e suite is opted out
  because it uses non-`test` script names like `e2e` / `e2e:ui`).
- Tailwind 4 uses CSS-first config (`@theme`, `@import "tailwindcss"`); there
  is no `tailwind.config.js`. For cross-package class detection add explicit
  `@source "../../<pkg>/src/**/*.{ts,tsx}";` directives in the consuming CSS.
- TypeScript 6 stricter checks: use `as unknown as T` for variance/abstract
  constructor casts.
- React 19: use `import type { ReactElement } from 'react'` instead of
  `JSX.Element`.
- Mobile-first UI: base classes target small viewports, `sm:`/`md:`/`lg:`
  enhance progressively. Verify any new screen at ~375px width.
- Action buttons get a leading `lucide-react` icon when semantics map
  cleanly (e.g. `Plus`=create, `Trash2`=delete, `Pencil`=edit, `Eye`=view).
- Commit messages follow Angular Conventional Commits:
  `<type>(<scope>): <subject>` with a per-package body.

## License

TBD.
