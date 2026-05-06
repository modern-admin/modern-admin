# Modern Admin

Universal, modern, performant admin panel framework — a spiritual successor to
[AdminJS](https://adminjs.co/) built on a contemporary stack with a focus on
DX, customization, and production-grade caching.

> Status: **early development**. Phases 0 (bootstrap) and 1 (core abstractions)
> are complete; remaining phases are in progress. APIs will change.

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
| Runtime / pm     | [Bun](https://bun.com)                          |
| Frontend         | TanStack Start, React 19                        |
| UI               | shadcn/ui, Tailwind CSS 4                       |
| Backend          | NestJS 11 (REST + GraphQL + WebSocket)          |
| ORMs (MVP)       | Prisma 7, Drizzle 0.45                          |
| Auth             | Better Auth                                     |
| Cache            | Redis (backend) + TanStack Query (frontend)     |
| Validation       | Zod 4 end-to-end                                |
| Language         | TypeScript 6 (strict)                           |

> Dependency policy: this project always pins to the latest stable release of
> each library. Code is adapted for breaking changes, not held back.

## Repository layout

```
modern-admin/
├── apps/
│   ├── web/                       — TanStack Start reference app
│   └── api/                       — NestJS reference app
├── packages/
│   ├── core/                      — @modern-admin/core (adapters, decorators, actions, ports)
│   ├── nest/                      — @modern-admin/nest (NestJS module: REST/GraphQL/WS)
│   ├── react/                     — @modern-admin/react (components, hooks, provider)
│   ├── ui/                        — @modern-admin/ui (shadcn primitives + themes)
│   ├── adapter-prisma/            — @modern-admin/adapter-prisma
│   ├── adapter-drizzle/           — @modern-admin/adapter-drizzle
│   ├── auth-better-auth/          — @modern-admin/auth-better-auth
│   ├── cache-redis/               — @modern-admin/cache-redis
│   └── tsconfig/                  — shared tsconfig presets
├── docker-compose.yml             — Postgres + Redis for development
└── package.json                   — bun workspaces root
```

## Architecture in one diagram

```
                        ┌─────────────────────────────────┐
                        │            Frontend             │
                        │  TanStack Start + shadcn/ui     │
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
- [x] **Phase 1 — Core abstractions.** `BaseDatabase`/`BaseResource`/
      `BaseProperty`/`BaseRecord`, decorators with Zod schemas,
      `ResourcesFactory`, built-in actions (list/show/new/edit/delete/
      bulkDelete/search), ports, `ModernAdmin` orchestrator. 43 unit tests.
- [ ] **Phase 2 — Prisma adapter.** DMMF-driven property inference, filter
      mapping, references, integration tests against Postgres.
- [ ] **Phase 3 — NestJS module.** REST controllers with OpenAPI from Zod,
      auth guard, cache interceptor, Better Auth wired into reference API.
- [ ] **Phase 4 — GraphQL transport.** Code-first dynamic schema, DataLoader
      for references, subscriptions over Redis pub/sub.
- [ ] **Phase 5 — Frontend core.** TanStack Start app, ModernAdminProvider,
      property-type components on shadcn, hooks, optimistic updates.
- [ ] **Phase 6 — Drizzle adapter.** Proves universality of the abstraction.
- [ ] **Phase 7 — Realtime.** WebSocket gateway, live list updates, toasts.
- [ ] **Phase 8 — Polish.** `create-modern-admin` CLI, docs site, theming,
      i18n, Playwright e2e.

Detailed plan: `/home/sergey/.claude/plans/fizzy-jumping-reef.md` (local).

## Development conventions

- Validation is Zod everywhere — option schemas, DTOs, form resolvers.
- Tests live next to packages in `<pkg>/test/` and run with `bun test`.
- Tailwind 4 uses CSS-first config (`@theme`, `@import "tailwindcss"`); there
  is no `tailwind.config.js`.
- TypeScript 6 stricter checks: use `as unknown as T` for variance/abstract
  constructor casts.
- React 19: use `import type { ReactElement } from 'react'` instead of
  `JSX.Element`.

## License

TBD.
