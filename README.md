# Modern Admin

Universal, modern, performant admin panel framework — a spiritual successor to
[AdminJS](https://adminjs.co/) built on a contemporary stack with a focus on
DX, customization, persistent system stores, and production-grade caching.

> Status: **feature-complete**, on the road to 1.0. Phases 0–8 done; Phase 9
> (feature plugins, dashboards, system persistence, AI) is largely complete.
> **533 unit tests** across 23 packages, all green; typecheck clean across
> all 29 workspace projects. Packages are released to GitHub Packages
> (`@modern-admin/*`, currently `0.1.x`).

## Why

AdminJS pioneered an elegant adapter/decorator model for auto-generating CRUD
admin panels from ORM schemas. Modern Admin keeps that model but addresses its
weaknesses:

- Outdated UI library and styling story → **shadcn/ui + Tailwind 4**
- Weak component customization, slow runtime bundling → **Vite + dynamic
  imports, no runtime bundler**
- No built-in caching → **Redis on the backend, TanStack Query on the
  frontend, tag-based invalidation**
- No GraphQL → **REST + GraphQL (queries, mutations, DataLoader, uploads)
  in parallel over the same decorated resources**
- Limited auth → **Better Auth (OAuth, passkeys, 2FA, magic links, API keys)**
- No realtime → **NestJS WebSocket gateway with Redis pub/sub**
- No persistent ops surface → **system-prisma / system-drizzle packages with
  pre-built models for action logs, history, webhooks, AI tasks, config, cache**
- No background work → **`@modern-admin/queue` (BullMQ + cron + distributed locks)**

## Stack

| Layer            | Choice                                              |
| ---------------- | --------------------------------------------------- |
| Runtime / pm     | [Bun](https://bun.com) 1.3+                         |
| Frontend         | Vite 8 + React 19 + TanStack Router 1.x (hash)      |
| UI               | shadcn/ui, Tailwind CSS 4 (CSS-first), Recharts 3   |
| Backend          | NestJS 11 (REST + GraphQL + WebSocket + OpenAPI)    |
| ORMs             | Prisma 7, Drizzle 0.45                              |
| Auth             | Better Auth 1.6+ (cookies + API keys)               |
| Cache            | Redis (backend) + TanStack Query 5 (frontend)       |
| Queue            | BullMQ + `@nestjs/bullmq` (jobs, cron, webhooks)    |
| Validation       | Zod 4 end-to-end                                    |
| Docs site        | Nextra 4 / Next.js                                  |
| Language         | TypeScript 6 (strict)                               |

> Dependency policy: this project always pins to the latest stable release of
> each library. Code is adapted for breaking changes, not held back.

## Repository layout

```
modern-admin/
├── apps/
│   ├── _shared/                   — shared admin config for api / api-prisma
│   ├── api/                       — NestJS reference app (bun:sqlite + Drizzle)
│   ├── api-prisma/                — NestJS reference app (Postgres + Prisma 7)
│   ├── web/                       — Vite + React 19 reference SPA
│   ├── e2e/                       — Playwright e2e tests
│   └── docs/                      — Nextra 4 docs site (apps/docs/content/en/docs/…)
├── packages/
│   ├── core/                      — adapters, decorators, actions, ports, system subsystems
│   ├── nest/                      — REST controllers + OpenAPI + WS bootstrap
│   ├── graphql/                   — schema builder (queries + mutations + DataLoader + uploads)
│   ├── realtime/                  — WebSocket gateway, Redis pub/sub
│   ├── queue/                     — BullMQ module + cron decorator + distributed locks
│   ├── react/                     — components, hooks, AdminClient, dashboard
│   ├── ui/                        — 40+ i18n-unaware shadcn primitives + charts + themes
│   ├── web/                       — pre-built React SPA (mountable or standalone)
│   ├── i18n/                      — 9 locales (~480 keys each)
│   ├── adapter-prisma/            — Prisma 7 adapter
│   ├── adapter-drizzle/           — Drizzle 0.45 adapter
│   ├── auth-better-auth/          — Better Auth integration
│   ├── cache-redis/               — Redis cache + pub/sub invalidation
│   ├── system-prisma/             — persistent system stores (logs/history/webhooks/AI/config/cache)
│   ├── system-drizzle/            — same for Drizzle
│   ├── feature-upload/            — Local + S3 file uploads, busboy, multipart
│   ├── feature-logging/           — action log (per-resource + global plugin)
│   ├── feature-history/           — revision history + field diff
│   ├── feature-webhooks/          — outbound webhooks (BullMQ, HMAC, retries)
│   ├── feature-ai-fill/           — AI fill form from photo/file
│   ├── feature-m2m/               — many-to-many junction tables
│   ├── feature-password/          — argon2/bcrypt password hashing
│   ├── feature-json-by-key/       — declarative JSON sub-properties
│   ├── create/                    — `bun create @modern-admin <name>` scaffolder
│   └── tsconfig/                  — shared TS presets
├── .changeset/                    — Changesets workflow
├── .github/workflows/release.yml  — CI publish → GitHub Packages
├── scripts/                       — dev.sh orchestrator, release.ts
├── RELEASING.md                   — full release procedure
├── docker-compose.yml             — Postgres + Redis for development
└── package.json                   — bun workspaces root
```

## Architecture in one diagram

```
                        ┌─────────────────────────────────┐
                        │            Frontend             │
                        │  Vite + React 19 + shadcn/ui    │
                        │  TanStack Query + Recharts      │
                        └──────────────┬──────────────────┘
                                       │ HTTP / GraphQL / WS
                        ┌──────────────▼──────────────────┐
                        │      @modern-admin/nest         │
                        │  REST · GraphQL · WS · OpenAPI  │
                        │  Auth Guard · Cache · Queue     │
                        └──────────────┬──────────────────┘
                                       │
                        ┌──────────────▼──────────────────┐
                        │      @modern-admin/core         │
                        │  ModernAdmin · ResourcesFactory │
                        │  Decorators · Actions · Filter  │
                        │  Ports · Subsystems · Dashboard │
                        └────┬─────────┬──────────┬───────┘
                             │         │          │
        ┌────────────────────▼─┐ ┌─────▼──────┐ ┌─▼──────────────┐
        │ adapter-{prisma,     │ │ system-    │ │ feature-*      │
        │  drizzle}            │ │  {prisma,  │ │ (upload,       │
        │ auth-better-auth     │ │   drizzle} │ │  logging,      │
        │ cache-redis          │ │            │ │  history, …)   │
        └──────────────────────┘ └────────────┘ └────────────────┘
```

Core defines abstractions (`BaseDatabase`, `BaseResource`, `BaseProperty`,
`BaseRecord`), Zod-validated decorator options, an action system with
`before`/`after` hooks, and **ports** for auth/cache/realtime/components,
plus **subsystem stores** (action logs, history, webhooks, AI tasks,
config, SQL cache) shared by feature plugins. Adapters, system packages,
and transports plug in without leaking ORM- or framework-specific types
into core.

## Feature plugins

Two scopes — both transform `ResourceOptions`:

1. **Local `FeatureFn`** — per-resource, declared in
   `ResourceWithOptions.features`. Example: `uploadFeature`,
   `actionLoggingFeature`, `historyFeature`, `passwordsFeature`,
   `m2mFeature`, `jsonByKeyFeature`, `aiFillFeature`.
2. **Global `GlobalPlugin`** — process-wide, registered once in
   `ModernAdmin({ plugins: [...] })`. Example: `actionLoggingPlugin`,
   `historyPlugin`, `webhookPlugin`.

All plugins chain hooks (never overwrite), all generated identifiers
use `uuidv7()`, and any port the plugin needs (`ILogStore`,
`IHistoryStore`, `IWebhookStore`, `IAiTaskStore`, …) has an in-memory
default plus a real Prisma / Drizzle implementation in the `system-*`
packages.

## Getting started

Prerequisites: **Bun ≥ 1.3**, **Node 20+**, **Docker** for the dev databases.

```bash
# Install all workspaces
bun install

# Bring up Postgres + Redis
bun run docker:up

# Run a reference app (separate terminals)
bun run dev:api          # bun:sqlite + Drizzle
# or
bun --filter @modern-admin/app-api-prisma dev   # Postgres + Prisma 7
bun run dev:web          # Vite SPA

# Workspace-wide checks
bun run typecheck        # 29 projects (excludes apps/docs)
bun test                 # 533 unit tests, all green
bun run e2e              # Playwright (PLAYWRIGHT_CHANNEL=chrome on Ubuntu 26.04)
```

Reference API listens on `http://localhost:3001` (`/health` for a smoke check).
Reference web app on `http://localhost:5173`.

Scaffold a new project:

```bash
bun create @modern-admin my-admin
```

## Roadmap

- [x] **Phase 0 — Bootstrap.** Bun workspaces, package skeletons, hello-world
      apps, docker-compose for Postgres + Redis.
- [x] **Phase 1 — Core abstractions.** `BaseDatabase` / `BaseResource` /
      `BaseProperty` / `BaseRecord`, decorators with Zod schemas,
      `ResourcesFactory`, built-in actions, ports, `ModernAdmin`
      orchestrator. **79 tests**.
- [x] **Phase 2 — Prisma adapter.** DMMF-driven property inference, filter
      mapping, references. **30 tests**.
- [x] **Phase 3 — NestJS module + Better Auth.** REST controllers with
      AdminJS-shaped routes (`/admin/api/resources/:id/actions/*`), auth
      guard, cache interceptor, `forFeature` registry, OpenAPI from Zod.
      **34 + 8 tests**.
- [x] **Phase 4 — GraphQL transport.** Dynamic schema with lazy compilation
      via `SchemaHolder` (`/admin/graphql`), **queries + mutations +
      DataLoader + multipart uploads + sandbox**. **9 tests**.
- [x] **Phase 5 — Frontend core.** Vite + React 19 + shadcn, TanStack
      Router (hash history), list/show/edit/new/login pages, property
      renderers, AdminClient, optimistic updates, hotkeys. **51 tests**.
- [x] **Phase 6 — Drizzle adapter.** Schema introspection via FK symbol
      keys. **40 tests**.
- [x] **Phase 7 — Realtime.** WebSocket gateway + Redis pub/sub.
      **12 tests**.
- [x] **Phase 8 — Polish.** `@modern-admin/create` CLI (**26 tests**),
      Nextra docs site (`apps/docs`), theming, i18n × 9 locales
      (**9 tests**), Playwright e2e, mobile-first UI, BigInt support,
      configurable `authBasePath`.
- [x] **Phase 9 — Feature plugins, dashboards, persistence, AI**
  - [x] `feature-upload` (Local + S3) — **47 tests**
  - [x] `feature-logging` — **17 tests**
  - [x] `feature-history` (revision diff) — **7 tests**
  - [x] `feature-webhooks` (BullMQ, HMAC) — **5 tests**
  - [x] `feature-ai-fill` (AI fill from photo/file) — **13 tests**
  - [x] `feature-m2m` (many-to-many) — **16 tests**
  - [x] `feature-password` (argon2/bcrypt) — **12 tests**
  - [x] `feature-json-by-key` (virtual JSON sub-fields) — **29 tests**
  - [x] `queue` (BullMQ + cron + distributed locks) — **24 tests**
  - [x] `system-prisma` (persistent stores) — **13 tests**
  - [x] `system-drizzle` (persistent stores) — **6 tests**
  - [x] Dashboard / chart-builder (KPI / line / area / bar, time-series,
        chart groups, per-user localStorage store)
  - [x] Global search, wizard create forms, AI assistant widget,
        audit-log page, revisions UI, admins & API keys, settings page
  - [x] `@modern-admin/web` pre-built SPA bundle
  - [x] Changesets + CI release pipeline → GitHub Packages
  - [ ] **GraphQL subscriptions** (`graphql-ws` + Redis pub/sub) — backlog
  - [ ] **LICENSE file in repo root** — packages declare MIT, root needs it
  - [ ] **1.0 stabilization** — currently published as `0.1.x`
  - [ ] **Additional adapters** (MongoDB, TypeORM) — backlog
  - [ ] **Server-side `IDashboardStore`** (currently localStorage only)

Detailed plan: `/home/sergey/.claude/plans/fizzy-jumping-reef.md` (local).

## Documentation

The full docs site lives at `apps/docs` (Nextra 4) and covers:
getting-started, architecture, decorators, resources, backend, frontend,
adapters (`prisma`, `drizzle`, `custom`), auth, cache, realtime, queue,
i18n, design-system, ui-components, integration-standalone, cli, agent
prompt, admins-and-roles, api-keys, AI assistant (+ architecture),
features (`upload`, `logging`, `history`, `webhooks`, `m2m`, `password`,
`json-by-key`) and APIs (`rest`, `graphql`, `openapi`).

Run locally:

```bash
bun run docs:dev
```

> Note: the docs site is scaffolded i18n-ready (`content/<locale>/…`), but
> only English content ships from the repo. Other locales are added manually.

## Development conventions

- Validation is Zod everywhere — option schemas, DTOs, form resolvers.
- Identifier policy: **UUID v7 everywhere** via `uuidv7()` from
  `@modern-admin/core` — never `crypto.randomUUID()`, `nanoid`, or ORM
  defaults.
- Tests live next to packages in `<pkg>/test/` and run with `bun test`.
- Workspace test sweep: `bun --filter '*' --filter '!@modern-admin/docs' test`
  (e2e suite is opted out because it uses non-`test` script names).
- Tailwind 4 uses CSS-first config (`@theme`, `@import "tailwindcss"`); there
  is no `tailwind.config.js`. For cross-package class detection add explicit
  `@source "../../<pkg>/src/**/*.{ts,tsx}";` directives in the consuming CSS.
  `border` requires an explicit color in Tailwind 4 — pair with
  `border-border`.
- TypeScript 6 stricter checks: use `as unknown as T` for variance/abstract
  constructor casts.
- React 19: use `import type { ReactElement } from 'react'` instead of
  `JSX.Element`.
- Mobile-first UI: base classes target small viewports, `sm:`/`md:`/`lg:`
  enhance progressively. Verify any new screen at ~375px width.
- i18n is mandatory — no hardcoded user-visible strings. UI components are
  i18n-unaware (accept `labels?` prop), `@modern-admin/react` is the
  translation boundary.
- Action buttons get a leading `lucide-react` icon when semantics map
  cleanly (e.g. `Plus`=create, `Trash2`=delete, `Pencil`=edit, `Eye`=view).
- Commit messages follow Angular Conventional Commits:
  `<type>(<scope>): <subject>` with a per-package body.
- Releases run through **Changesets + `.github/workflows/release.yml`** —
  see `RELEASING.md` for the full procedure.

## License

MIT (per `package.json` of each published package). A repo-root `LICENSE`
file is on the backlog before 1.0.
