# @modern-admin/app-e2e

End-to-end smoke tests for the reference apps. Drives the seeded
in-memory adapter — no real database needed.

## Setup

```sh
bun install
bun run install-browsers   # one-time chromium download
```

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

Playwright launches the API (`apps/api`) on port 3001 and the web SPA
(`apps/web`) on port 5173 automatically via `webServer` config — no need
to start them manually.

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

## Adding a database backend

To run the same scenarios against the Prisma or Drizzle adapters,
override `apps/api/src/admin.module.ts` to register the corresponding
adapter and point `DATABASE_URL` at a test database. The CRUD spec is
adapter-agnostic and should pass unchanged.
