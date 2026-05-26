# Deployment & host-schema reuse

## Deployment model — default to standalone

The recommended layout is a **separate NestJS service** that talks to
the same Postgres as the main backend. Reasons: independent deploys,
smaller attack surface, language-agnostic main backend.

Scaffold with:

```sh
MODERN_ADMIN_TOKEN=ghp_xxx bun create @modern-admin admin-service
```

This produces a NestJS 11 app with:

- `prisma/schema.prisma` — `ma_*` system tables only (admins, sessions,
  roles, logs, history, config, dashboards, cache).
- `src/main.ts` — `createBetterAuthMiddleware(toNodeHandler(auth))` mounted at
  `/admin/api/auth` **before** any body parser (see auth-and-infra.md §11d).
- `src/admin.module.ts` — `ModernAdminModule.forRoot({...})` wired with
  Prisma + Better Auth.
- `src/app.module.ts` — imports both `AdminModule` and
  `ModernAdminStaticUiModule.forRoot({ path: '/admin', … })` so the
  prebuilt `@modern-admin/web` SPA is served at `/admin` from the same
  origin as the API. Without this module the API returns 404 for `/admin`
  and any deep refresh — see auth-and-infra.md §11c.
- `src/db.ts` — `PrismaPg` driver adapter + `getDMMF` from
  `@prisma/internals` (Prisma 7 client no longer exposes `Prisma.dmmf`).
- `src/auth.ts` — Better Auth with `modelName: 'MaUser'` etc. (the
  Prisma model name, NOT the physical table name `ma_user`).

Mount it under `/admin` of the main domain via reverse proxy. Do not
serve the SPA from a separate origin unless you also configure CORS.

## Detecting an existing Prisma project — REUSE, do NOT duplicate

If the host project **already has** a Prisma schema and generated
client, the agent MUST integrate with it instead of producing parallel
artefacts. Before scaffolding ANY admin code, run this analysis:

1. **Find the existing schema.** Look for `prisma/schema.prisma` in
   the repo root, in `apps/*/prisma`, in `packages/*/prisma`, and in
   directories named in `package.json#prisma.schema`.
2. **Find the existing generator output.** Read the `generator client`
   block — the `output` path is where the client lives.
3. **Decide where the admin-service lives:**
   - **Same workspace as the host** → import the host's existing
     `PrismaClient` directly. Do NOT add a second `generator` to the
     schema. Do NOT generate a parallel client in
     `admin-service/src/generated/prisma`.
   - **Separate repo / separate deployable** → still keep ONE schema.
     Mount the existing schema file into the admin-service container
     (Docker volume or git submodule) and run `prisma generate`
     against it from inside the admin-service to produce its own
     ESM-shaped client, but **never edit the schema fork** — open a
     PR back to the host's schema.

### Merging `ma_*` tables into the host's schema (the only acceptable mutation)

The canonical fragment lives at
`packages/system-prisma/prisma/modern-admin.prisma` in the
`modern-admin` repo. It defines **fourteen** `Ma*` models — copy ALL
of them verbatim, not a subset. `setupPrismaSystem(prisma)` resolves
every delegate eagerly on boot and throws at startup if any are
missing:

```
[modern-admin/system-prisma] missing delegate "prisma.maWebhook".
Make sure the Modern Admin schema fragment is included in your
schema.prisma (see @modern-admin/system-prisma/schema), and that the
Prisma client has been generated.
   at resolveDelegate ( …/system-prisma/dist/types.js )
   at setupPrismaSystem ( …/system-prisma/dist/index.js )
```

This error is a **runtime failure, not a typecheck failure** —
`bun run dev` will still start the process, but the framework module
will refuse to load. Cherry-picking 10 of 14 models compiles fine and
fails the moment a request lands.

```diff
  // host/prisma/schema.prisma
  model Product { ... }
  model Order   { ... }
+
+ // ── Modern Admin system tables (ALL 14 required) ─────────────
+ // Better Auth (5):
+ model MaUser          { ... }
+ model MaSession       { ... }
+ model MaAccount       { ... }
+ model MaVerification  { ... }
+ model MaApiKey        { ... }
+ // Modern Admin core (9):
+ model MaRole             { ... }
+ model MaLog              { ... }
+ model MaWebhook          { ... }   // ← easy to forget
+ model MaWebhookDelivery  { ... }   // ← easy to forget
+ model MaConfig           { ... }
+ model MaHistory          { ... }
+ model MaAiTask           { ... }   // ← easy to forget
+ model MaAiTaskEvent      { ... }   // ← easy to forget
+ model MaCache            { ... }
```

Copy the `ma_*` model definitions verbatim from
`packages/system-prisma/prisma/modern-admin.prisma` in the
modern-admin repo — that file is the source of truth. After merging,
run `bun run prisma:generate` and create one migration named
`add_modern_admin_system_tables`; commit the migration together with
the schema change.

### Verification step (do this before declaring scaffold done)

```bash
# Every one of these must list a Prisma model — empty output means
# the schema is incomplete and `setupPrismaSystem` will throw on boot.
grep -E '^model (MaUser|MaSession|MaAccount|MaVerification|MaApiKey|MaRole|MaLog|MaWebhook|MaWebhookDelivery|MaConfig|MaHistory|MaAiTask|MaAiTaskEvent|MaCache) ' prisma/schema.prisma
```

### Anti-pattern — duplicated generator (DO NOT DO)

```prisma
// ❌ NEVER add a second generator just to produce an ESM client for
//    admin-service. The two clients drift, every `prisma migrate`
//    needs two `prisma generate` runs, and bun-native imports work
//    fine against the host's CJS client.
generator adminClient {
  provider = "prisma-client"
  output   = "../admin-service/src/generated/prisma"
}
```

If the host client is CJS and admin-service is bun/ESM, you can still
import the CJS client from ESM — bun handles the interop. A separate
generator output is only justified when the two clients target truly
different Prisma versions, and that is a smell, not a feature.
