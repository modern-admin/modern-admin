---
name: modern-admin-integration
description: Use this skill when integrating, configuring, or extending Modern Admin (`@modern-admin/*`) in a host project — i.e. wiring `ModernAdminModule.forRoot`, adding admin resources, configuring Better Auth/Prisma/Redis, declaring properties or `@Action`/`@Before`/`@After` hooks, setting up role permissions (`MaRole.permissions`), or troubleshooting auth/SPA 404s. Triggers on tasks that mention `@AdminResource`, `AdminController`, `adminSource`, `BetterAuthProvider`, `ModernAdminStaticUiModule`, `setupPrismaSystem`, `MaRole`, `rolesResourceId`, the `ma_*` schema fragment, or scaffolding `bun create @modern-admin`.
version: 1.0.0
license: MIT
---

# Modern Admin — Integration skill

Modern Admin is a vendor framework. Treat `@modern-admin/*` as read-only;
only call its public exports. This skill encodes the project's non-obvious
rules so you don't re-discover them.

## Ground rules (always apply)

1. **bun only.** Never `npm`/`yarn`/`pnpm`.
2. **UUID v7 for every generated id.** `import { uuidv7 } from '@modern-admin/core'`.
   Never `crypto.randomUUID()`, `randomUUID()`, `nanoid`. Don't trust
   `@default(uuid(7))` — generate in app code.
3. **Latest stable versions.** Adapt code to new APIs; never pin older to dodge
   breaking changes.
4. **i18n everywhere.** No hardcoded user-visible strings. Add keys to
   `packages/i18n/src/locales/en.ts` AND mirror to all 8 other locales
   (`de`/`es`/`fr`/`it`/`ja`/`pl`/`pt-BR`/`ru`). UI components stay
   i18n-unaware (`labels?: {...}` prop); `packages/react` is the translation
   boundary. See `references/conventions.md`.
5. **Mobile-first.** Verify every new UI at ≤375px viewport.
6. **Auto-discovery beats config.** Override only what diverges.

## When to use Modern Admin

Use it for CRUD-over-Postgres admin panels (Prisma 7 / Drizzle 0.45) with
role-gated actions, search, filters, uploads, audit log, revisions, webhooks,
AI assistant. **Don't** use it for public UI, non-relational stores, or
when admin shouldn't share a DB with main app (use it as a separate service
against a replica instead).

## Deployment model — default to standalone

Recommended layout: separate NestJS 11 service against the same Postgres.
Scaffold with `MODERN_ADMIN_TOKEN=ghp_xxx bun create @modern-admin admin-service`.
Mount behind `/admin` of the main domain via reverse proxy. See
`references/deployment.md` for the existing-Prisma reuse rules (one schema,
one client; never add a second `generator`) and the **fourteen** `Ma*` models
that must be copied verbatim — `setupPrismaSystem` fails at boot if any are
missing.

## The three pieces of every resource

1. **Source registry** (`src/admin-sources.ts`) — maps logical resource ids
   to adapter-specific raw source objects via `registerAdminSources({...})`.
   Import as a side-effect **before** `NestFactory.create` in `main.ts`.
2. **Resource controller** — `extends AdminController<Row>` (never body-less),
   carries `@AdminResource(...)` metadata + `@Before`/`@After` hooks +
   `@Action` methods.
3. **NestJS module** — `@Module({ controllers: [FooAdminController] })`.

See `references/resources.md` for the canonical Prisma source factory
(including the **critical** relation-field-`type` rewrite for FK→reference
resolution), the resource-creation 8-step checklist, and the property-type
selection matrix.

## NestJS-style permissions — `actions:` key is FORBIDDEN

> The #1 mistake AI agents make.

`AdminResourceMeta = Omit<ResourceOptions, 'actions'> & {source, ...}`.
Writing `@AdminResource({ actions: {...} })` is a `TS2353`. All action
config goes through `@Action`/`@Before`/`@After` method decorators, or —
for role gating — through `MaRole.permissions` (DB-driven, edited in the
panel). Code-pinned `isAccessible` is reserved for invariants no role may
bypass. See `references/permissions.md` for the role-matrix recipe, true-
invariant `Promise<never>` stubs, base-class signature matching for
overrides (avoid `TS2416`), and the `guard:` vs `isAccessible:` distinction.

## Auth wiring — the five must-knows

1. **`admin()` plugin is MANDATORY** when using `rolesResourceId`. Without
   it `session.user.role` is `undefined` and every role-gated action returns
   403 — even when `ma_user.role` is `'admin'` in the database.
2. **Mount Better Auth via `createBetterAuthMiddleware(toNodeHandler(auth))`,
   not bare `toNodeHandler`.** The bare handler is greedy and shadows
   `AuthController`'s `/login`, `/me`, `/ui-props` with its own 404s.
3. **`ModernAdminStaticUiModule.forRoot({ path: '/admin', ... })` is
   REQUIRED** to serve the SPA + handle deep-link refreshes. Without it
   `/admin` and every refresh 404s.
4. **`RedisCacheProvider({ client, subscriber })` — pass clients, not URLs.**
   ioredis can't multiplex pub/sub on a command connection.
5. **Keep `app.use(<basePath>, ...)`, `betterAuth({ basePath })`, and
   `runtimeConfig.authBasePath` in lockstep.** A mismatch surfaces as
   `POST /api/auth/sign-in/email 404` on login.

Full details + code examples: `references/auth-and-infra.md`.

## References

- `./references/deployment.md` — §2 standalone deploy, §2.5 reusing existing
  Prisma schema, the 14 `Ma*` models, anti-pattern of duplicated generators.
- `./references/resources.md` — §3 the three-pieces recipe, source registry,
  resource controller, 8-step per-resource checklist, §4 property-type matrix,
  §5 hide vs. expose (`isVisible` vs `isAccessible`).
- `./references/permissions.md` — §6 roles × actions, DB-driven vs code-pinned,
  `actions:` forbidden, read-only via roles, base-class signature, true
  invariants, sealed-invariant property `isAccessible`, `guard:` vs permissions.
- `./references/actions-and-plugins.md` — §7 built-in actions and when to
  override, §8 plugin/feature selection guide, §10 hooks vs actions vs handlers.
- `./references/custom-ui.md` — §9 when to write a custom component, the
  three-step workflow, `@modern-admin/ui` primitives, Tailwind 4 `border` rule.
- `./references/auth-and-infra.md` — §11 a–f: `BetterAuthProvider` wiring,
  `RedisCacheProvider`, `ModernAdminStaticUiModule`, `createBetterAuthMiddleware`,
  `admin()` plugin requirement, `BigInt` serialisation.
- `./references/conventions.md` — §12 i18n boundary, §13 UUID v7,
  §14 cache + realtime.
- `./references/anti-patterns.md` — §15 full anti-pattern list,
  §16 verification checklist, §17 reference index of canonical files.

## Verification checklist (always run before "done")

- [ ] `bun run dev` (or `scripts/dev.sh start api-prisma web`) starts clean;
      `.dev-logs/` show no errors.
- [ ] Seed admin can log in at `/admin` and sees every registered resource.
- [ ] Sensitive columns (`password`, `apiKey`, …) absent from both JSON and UI.
- [ ] Every destructive action has `guard:` confirm + `isAccessible` role check.
- [ ] Every new visible string exists in all 9 locale files.
- [ ] `bun run typecheck` is green workspace-wide.
- [ ] Tests added for every custom hook, action handler, UI component.
- [ ] 375px viewport: list/show/edit pages have no horizontal page scroll.

## Canonical files to read before writing new code

- `apps/_shared/src/admin/posts/posts.controller.ts` — hooks + record + bulk
  actions.
- `apps/_shared/src/admin/customers/customers.controller.ts` —
  `passwordsFeature` + `aiFillFeature` + custom action.
- `apps/_shared/src/admin/source-registry.ts` — source registry.
- `apps/api-prisma/src/admin-sources.ts` — logical-id mapping + relation
  field rewriting.
- `apps/api-prisma/src/admin.module.ts` — admin module wiring.
- `packages/core/src/decorators/{resource,property,action}-options.ts` —
  schemas.
- `packages/core/src/actions/action.ts`,
  `packages/core/src/ports/current-admin.ts` — `ActionContext`,
  `CurrentAdmin` types for `isAccessible`/`isVisible` callbacks.
- `packages/nest/src/admin/decorators.ts` — `AdminController`, `@Before`,
  `@After`, `@Action`.

When in doubt, read the source — every public export has JSDoc explaining
its contract.
