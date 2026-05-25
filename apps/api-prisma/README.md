# `apps/api-prisma`

Reference deployment of `@modern-admin/nest` against a real **PostgreSQL**
database via **Prisma 7**. This is the canonical demo host — the
Playwright e2e suite (`apps/e2e/`) drives every spec against it.

## What it shows

- One `PrismaClient` shared between **Better Auth** (`prismaAdapter`),
  the Modern Admin **Prisma adapter**, and the **system stores**
  (`@modern-admin/system-prisma`). Single connection pool, single
  migration history.
- The `Ma*` system tables (`ma_log`, `ma_webhook`, `ma_config`, …) live
  in the host's own `schema.prisma`, prefixed with `ma_*` and `@@map`'d
  to lower-case names. Drop them in next to your business models — no
  separate database, no separate migration tool.
- `actionLoggingPlugin({ store: system.logStore })` writes to `ma_log`
  instead of stdout, demonstrating how feature plugins pick up a real
  persistent store.

## Setup

```bash
cp .env.example .env
# edit DATABASE_URL to point at your Postgres

bun install
bun run prisma:generate
bun run prisma:migrate     # creates ma_*, user, session, account, …
bun run dev                # http://localhost:3001
```

The seeded demo admin (`admin@example.com / admin12345`) is created on
first boot via `seedDemoUser()`.

## Where things live

| Concern                 | File / module                                               |
| ----------------------- | ----------------------------------------------------------- |
| PrismaClient singleton  | `src/db.ts`                                                 |
| Better Auth config      | `src/auth.ts` (`prismaAdapter` + `apiKey` plugin)           |
| Modern Admin wiring     | `src/admin.module.ts` (`setupPrismaSystem`, plugins)        |
| Nest bootstrap          | `src/main.ts` (mounts Better Auth at `/api/auth`)           |
| Schema (Auth + Ma + biz)| `prisma/schema.prisma`                                      |

## Adding resources

Declare per-feature modules with `AdminController` subclasses (see the
existing modules exported by `@modern-admin/app-shared` for examples)
and import them in `src/admin.module.ts`. The Prisma adapter discovers
Prisma models from the shared `Prisma.dmmf` passed into
`ModernAdminModule.forRoot`.
