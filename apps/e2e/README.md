# @modern-admin/app-e2e

End-to-end smoke tests for the reference apps. Drives the
`apps/api-prisma` Nest service against a real Prisma 7 + Postgres
backend with deterministic demo fixtures.

## Setup

```sh
bun install
bun run install-browsers   # one-time chromium download

# Bring up the Postgres + Redis services declared in docker-compose.yml
bun run docker:up

# Apply Prisma migrations
bun run --cwd apps/api-prisma prisma:migrate
```

`bun run docker:up` provisions Postgres on port 5432 and Redis on 6379.
The `SEED_DEMO=1` env var (set by the Playwright `webServer` config)
populates the same row volumes the legacy in-memory adapter used to
ship — re-runs are idempotent (`upsert` by deterministic UUID).

If your platform isn't supported by the bundled Playwright chromium build
(e.g. pre-release Ubuntu), set `PLAYWRIGHT_CHANNEL=chrome` (or `chromium`)
to use a locally-installed browser instead:

```sh
PLAYWRIGHT_CHANNEL=chrome bun run e2e
```

## Run

```sh
bun run e2e                     # all projects
bun run e2e --project=api       # only API/GraphQL (no browser)
bun run e2e --project=chromium  # only browser tests (auto-runs auth setup)
bun run e2e:ui                  # Playwright UI
```

Playwright launches the API (`apps/api-prisma`) on port 3001 and the
web SPA (`apps/web`) on port 5173 automatically via `webServer` config
— no need to start them manually (but Postgres + Redis must already be
running, see Setup above).

## Projects

| Project    | Tests                                                            |
| ---------- | ---------------------------------------------------------------- |
| `api`      | `tests/api.spec.ts`, `tests/graphql.spec.ts` (no browser, no auth) |
| `setup`    | `tests/auth.setup.ts` — logs in once, saves storage state         |
| `chromium` | Browser tests, depend on `setup`, reuse its storage state         |

The `setup` project signs in as the seeded demo admin
(`admin@example.com` / `admin12345`, overridable via `DEMO_ADMIN_EMAIL`
/ `DEMO_ADMIN_PASSWORD`) and writes the session to
`playwright/.auth/admin.json`. The browser project loads that file as
its `storageState`, so every browser test starts already authenticated
— no per-test login overhead.

## Tests

| File                              | Scope                                      |
| --------------------------------- | ------------------------------------------ |
| `tests/api.spec.ts`               | REST CRUD lifecycle for the `customers` resource, plus list pagination and reference fields. |
| `tests/graphql.spec.ts`           | GraphQL schema + query smoke. |
| `tests/web.spec.ts`               | SPA mount, home page, customer list navigation. |
| `tests/list-page-layout.spec.ts`  | Sticky paginator, mobile (375 × 700) scroll containment, records-count + per-page select layout, first/last chevron visibility, drag-scroll on table & pagination buttons. |
| `tests/list-crud.spec.ts`         | List page: pagination → URL `page=` param, toolbar filter sheet writing the filter into the URL, row click → edit page, row-actions menu → show page, row-actions delete (with confirmation) removing the record both from the UI and on the server. |
| `tests/show-page.spec.ts`         | Show page renders the record header + breadcrumbs + field values; header buttons drive edit/back/list navigation; delete from show page returns to the list and 404s the record on the API. |
| `tests/edit-page.spec.ts`         | Edit form hydrates from the loaded record; Save fires a PATCH against the canonical action URL and redirects to the show page with the updated value; new-record form refuses submission (and never fires a POST) when required fields are missing. |
| `tests/not-found.spec.ts`         | Existing resource + non-existent record id renders the localized `errors:notFound` card on both show and edit pages; unmatched paths and unknown sub-segments fall through to the router's default not-found component while keeping the URL intact. |

## Running against a different adapter

The e2e suite is adapter-agnostic — the specs assert on the API
contract, not on storage internals. To target the Drizzle adapter (or a
custom one) instead of Prisma, point the `webServer.command` in
`playwright.config.ts` at a host app that wires the desired adapter
and provide a compatible seed (the `customers` / `posts` / `tags` /
… fixtures the specs assume).
