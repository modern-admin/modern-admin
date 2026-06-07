# Modern Admin

Universal, modern, performant admin panel framework — inspired by
[AdminJS](https://adminjs.co/) and built on a contemporary stack with a focus on
DX, customization, persistent system stores, and production-grade caching.

> Modern Admin is an independent project, not affiliated with or endorsed by
> AdminJS / SoftwareBrothers.

## Why

AdminJS pioneered an elegant adapter/decorator model for auto-generating CRUD
admin panels from ORM schemas. Modern Admin keeps that model but addresses its
weaknesses:

- Outdated UI library and styling story → **shadcn/ui + Tailwind 4**
- Weak component customization, slow runtime bundling → **Vite + dynamic
  imports, no runtime bundler**
- No built-in caching → **Redis on the backend (`@modern-admin/cache-redis`),
  in-process `MemoryCacheProvider` in core, TanStack Query on the frontend;
  per-resource TTL config, split `list`/`record` tag invalidation, in-flight
  request deduplication**
- No GraphQL → **REST + GraphQL (queries, mutations, DataLoader, uploads)
  in parallel over the same decorated resources**
- Limited auth → **Better Auth (OAuth, passkeys, 2FA, magic links, API keys)**
- No realtime → **NestJS WebSocket gateway with Redis pub/sub**
- No persistent ops surface → **system-prisma / system-drizzle packages with
  pre-built models for action logs, history, webhooks, AI tasks, config, cache**
- No background work → **`@modern-admin/queue` (BullMQ + cron + distributed locks)**

## Stack

| Layer        | Choice                                            |
|--------------|---------------------------------------------------|
| Runtime / pm | [Bun](https://bun.com)                            |
| Frontend     | Vite 8 + React 19 + TanStack Router 1.x           |
| UI           | shadcn/ui, Tailwind CSS 4 (CSS-first), Recharts 3 |
| Backend      | NestJS 11+ (REST + GraphQL + WebSocket + OpenAPI) |
| ORMs         | Prisma 7+, Drizzle 0.45+                          |
| Auth         | Better Auth 1.6+ (cookies + API keys)             |
| Cache        | Redis (backend) + TanStack Query 5 (frontend)     |
| Queue        | BullMQ + `@nestjs/bullmq` (jobs, cron, webhooks)  |
| Validation   | Zod 4 end-to-end                                  |
| Language     | TypeScript 6 (strict)                             |

> Dependency policy: this project always pins to the latest stable release of
> each library. Code is adapted for breaking changes, not held back.

## Repository layout

```
modern-admin/
├── apps/
│   ├── _shared/                   — shared admin config for the reference apps
│   ├── api-prisma/                — NestJS reference app (Postgres + Prisma 7)
│   ├── web/                       — Vite + React 19 reference SPA
│   └── e2e/                       — Playwright e2e tests
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
│   ├── feature-history/           — revision history + field diff
│   ├── feature-m2m/               — many-to-many junction tables
│   ├── feature-password/          — argon2/bcrypt password hashing
│   ├── feature-json-by-key/       — declarative JSON sub-properties
│   ├── license/                   — license-gate (jose, Ed25519/JWS) for Pro packages
│   ├── telemetry/                 — anonymous usage telemetry
│   ├── create/                    — `bun create @modern-admin <name>` scaffolder
│   └── tsconfig/                  — shared TS presets
├── .changeset/                    — Changesets workflow
├── .github/workflows/release.yml  — CI publish → npm (registry.npmjs.org)
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
config, SQL cache) shared by feature plugins. Core also ships a
`MemoryCacheProvider` (in-process, TTL + tag-index) and `NoopCacheProvider`
for zero-config dev/test use. Adapters, system packages, and transports
plug in without leaking ORM- or framework-specific types into core.

## Feature plugins

Two scopes — both transform `ResourceOptions`:

1. **Local `FeatureFn`** — per-resource, declared in
   `ResourceWithOptions.features`. Example: `uploadFeature`,
   `actionLoggingFeature`, `historyFeature`, `passwordsFeature`,
   `m2mFeature`, `jsonByKeyFeature`, `aiFillFeature`.
2. **Global `GlobalPlugin`** — process-wide, registered once in
   `ModernAdmin({ plugins: [...] })`. Example: `actionLoggingPlugin`,
   `historyPlugin`, `webhookPlugin`.

All plugins chain hooks (never overwrite) and any port the plugin
needs (`ILogStore`, `IHistoryStore`, `IWebhookStore`, `IAiTaskStore`, …)
has an in-memory default plus a real Prisma / Drizzle implementation
in the `system-*` packages.

Custom actions support an optional **`guard`** field — a confirmation
prompt shown before the action fires. The `confirmGuard(action, dialogs)`
helper in `@modern-admin/react` wires this across every invoke call-site
(toolbar, bulk bar, row dropdown, show-page). Translations for
`relatedResources` tab labels are now part of `metadataTranslations`
(key = resource id), resolved via `localizeRelatedResources()`.

The sidebar supports a configurable option to **show resource IDs**
alongside resource names, useful during development.

## Getting started

Prerequisites: **Bun ≥ 1.3**, **Node 20+**, **Docker** for the dev databases.

```bash
# Install all workspaces
bun install

# Bring up Postgres + Redis
bun run docker:up

# Run the reference apps (separate terminals)
bun run dev:api          # NestJS API — Postgres + Prisma 7 (apps/api-prisma)
bun run dev:web          # Vite + React 19 SPA

# Workspace-wide checks
bun run typecheck        # all workspace projects
bun test                 # 547 unit tests, all green
bun run e2e              # Playwright (PLAYWRIGHT_CHANNEL=chrome on Ubuntu 26.04)
```

Reference API listens on `http://localhost:3001` (`/health` for a smoke check).
Reference web app on `http://localhost:3000` (override with `WEB_PORT`).

Scaffold a new project:

```bash
bun create @modern-admin my-admin
```

## Documentation

Full documentation lives at **<https://docs.modernadminpro.com/docs/getting-started>**.

## Development conventions

- Validation is Zod everywhere — option schemas, DTOs, form resolvers.
- Identifier policy: **UUID v7 everywhere** via `uuidv7()` from
  `@modern-admin/core` — never `crypto.randomUUID()`, `nanoid`, or ORM
  defaults.
- Tests live next to packages in `<pkg>/test/` and run with `bun test`.
- Workspace test sweep: `bun --filter '*' test`
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
- Custom actions support `guard?: string` — a description shown in a confirm
  dialog before the action fires. Use `confirmGuard(action, dialogs)` from
  `@modern-admin/react` at every invoke call-site.
- `relatedResources[].label` is translatable: set `relatedResources` map in
  `metadataTranslations`; `localizeRelatedResources()` resolves the labels.
- Cache behavior is configurable per resource via `ResourceOptions.cache`:
  `{ action?: { enabled, ttl }, http?: { enabled, ttl } }`. Core ships
  `MemoryCacheProvider` (TTL + tags) and `NoopCacheProvider`; Redis is in
  `@modern-admin/cache-redis`. HTTP responses and action cache share the same
  `listTag` / `recordTag` split for targeted invalidation.
- Commit messages follow Angular Conventional Commits:
  `<type>(<scope>): <subject>` with a per-package body.
- Releases run through **Changesets + `.github/workflows/release.yml`** —
  see `RELEASING.md` for the full procedure.

## License

[MIT](./LICENSE). Every published `@modern-admin/*` package declares
`"license": "MIT"` in its `package.json`; the canonical text lives in
`LICENSE` at the repo root.
