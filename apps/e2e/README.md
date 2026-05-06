# @modern-admin/app-e2e

End-to-end smoke tests for the reference apps. Drives the seeded
in-memory adapter — no real database needed.

## Setup

```sh
bun install
bun run install-browsers   # one-time chromium download
```

## Run

```sh
bun run e2e             # headless
bun run e2e:ui          # Playwright UI
```

Playwright launches the API (`apps/api`) on port 3001 and the web SPA
(`apps/web`) on port 5173 automatically via `webServer` config — no need
to start them manually.

## Tests

| File              | Scope                                      |
| ----------------- | ------------------------------------------ |
| `tests/api.spec.ts` | REST CRUD lifecycle for the `users` resource, plus list pagination and reference fields. |
| `tests/web.spec.ts` | SPA mount, home page, list navigation.   |

## Adding a database backend

To run the same scenarios against the Prisma or Drizzle adapters,
override `apps/api/src/admin.module.ts` to register the corresponding
adapter and point `DATABASE_URL` at a test database. The CRUD spec is
adapter-agnostic and should pass unchanged.
