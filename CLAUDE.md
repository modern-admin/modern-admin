# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Modern Admin is a universal admin-panel framework (an adapter/decorator model
in the spirit of AdminJS, on a current stack). It is a **bun workspaces
monorepo**: `packages/*` are the published `@modern-admin/*` packages,
`apps/*` are private reference apps plus the Playwright harness.

## Commands

```bash
bun install                    # install all workspaces
bun run docker:up              # Postgres 18 + Redis 8 (docker-compose.yml)
bun run docker:down

bun run dev:api                # NestJS reference API   → http://localhost:3001
bun run dev:web                # Vite + React SPA       → http://localhost:3000

bun run typecheck              # every workspace (tsc --noEmit)
bun run lint                   # oxlint over the whole repo (single root .oxlintrc.json)
bun run lint:fix               # oxlint --fix
bun run format                 # prettier --write .
bun run format:check           # prettier --check . (CI gate)
bun run test                   # unit tests, per workspace (= bun --filter '*' test)
bun test                       # unit tests, one bun runner over the whole repo
bun run build                  # build all publishable packages
bun run e2e                    # Playwright suite (apps/e2e)
```

Scoping to one package — both forms work:

```bash
bun run oxlint packages/react                    # lint one package (path scope)
bun test --cwd packages/core                     # tests of one package
bun test packages/core/test/filter.test.ts       # a single test file
bun test --cwd packages/core -t 'parses between' # a single test by name
bun run e2e list-crud                            # a single e2e spec (path substring)
```

Prisma (reference app; **no migrations are checked in** — the schema is pushed):

```bash
bun run --filter @modern-admin/app-api-prisma prisma:generate   # needed before typecheck
bun run --filter @modern-admin/app-api-prisma prisma:push
bun run --filter @modern-admin/app-api-prisma prisma:studio
```

Background dev servers with captured logs (`scripts/dev.sh`, useful when you
cannot attach to a live terminal):

```bash
bun run dev:start              # starts api-prisma + web, logs → .dev-logs/<svc>.log
bun run dev:status
bun run dev:stop
scripts/dev.sh tail web
```

### Port gotcha

`bun run dev:web` defaults to **3000** (`WEB_PORT`), but `scripts/dev.sh` and
`apps/e2e/playwright.config.ts` use **5173** so Playwright's
`reuseExistingServer` can attach to an already-running dev server. If you
start the web app manually and then run e2e, start it on 5173.

### CI (`.github/workflows/ci.yml`)

Three jobs: **check** (install → `prisma generate` → typecheck → lint →
`format:check` → unit tests; hermetic, no services), **e2e** (docker-compose
Postgres/Redis,
`prisma:push`, `build:standalone`, everything except the visual-regression
spec), and **e2e-visual** (that spec only, inside
`mcr.microsoft.com/playwright:v1.62.1-noble` so the checked-in
`*-chromium-linux.png` baselines match byte-for-byte — regenerate baselines in
that same image). The api app boots `ModernAdminStaticUiModule`, which reads
`packages/web/dist/standalone/index.html`, so
`bun run --filter @modern-admin/web build:standalone` must run before e2e.

## Architecture

```
Frontend (Vite 8 · React 19 · shadcn/ui · TanStack Query/Router)
        │ REST / GraphQL / WebSocket
@modern-admin/nest        REST controllers · guards · cache interceptor · OpenAPI
@modern-admin/graphql     schema builder · DataLoader · uploads
@modern-admin/realtime    WS gateway · Redis pub/sub
        │  all of them call ModernAdmin.invoke()
@modern-admin/core        ModernAdmin · ResourcesFactory · decorators · actions
                          Filter · ports · system stores · dashboard
        │
adapter-{prisma,drizzle} · system-{prisma,drizzle} · feature-* · auth-better-auth · cache-redis
```

**Layering is the load-bearing rule.** `packages/core` defines only
abstractions (`BaseDatabase` / `BaseResource` / `BaseProperty` / `BaseRecord`,
Zod-validated decorator options, actions, ports) and must never import an ORM,
transport, or UI library. ORM code lives in exactly one `packages/adapter-*`
each; transports live in `packages/nest` / `packages/graphql` and consume
`ModernAdmin.invoke()` rather than reaching into resources directly.

### The `invoke()` pipeline

`packages/core/src/modern-admin.ts` is the single funnel every transport goes
through. Read it before changing action behavior. Order:

1. `findResource` → `resource.decorate()` → `getAction(name)`; unknown action
   throws `ActionNotFoundError`.
2. Build `ActionContext` (`admin`, `resource`, `action`, `cache`,
   `cacheRuntime`, optional `currentAdmin`).
3. Hydrate `context.record` (record actions) or `context.records` (bulk
   actions) from `params.recordId` / `params.recordIds`.
4. `assertActionAccess` — the authorization gate.
   `canAccess(resourceId, action, currentAdmin)` is the public non-throwing
   variant reusing the exact same gates; callers outside the pipeline (WS
   subscriptions, room joins) must use it rather than re-implementing checks.
5. `before` hooks (single fn or array, chained) → `action.handler` → `after`
   hooks.
6. `invalidateMutationCaches` — runs _after_ all hooks so anything an
   after-hook writes (m2m junction diffs, upload persistence) can't be
   re-cached by a concurrent read. Built-ins (`new`/`edit`/`delete`/
   `bulkDelete`) participate automatically; custom actions opt in with
   `invalidates: true | string[]`.
7. `filterActionResponseProperties` (drops non-accessible properties) →
   `emitMutationEvents` (created/updated/deleted onto the realtime bus; bus
   errors are swallowed so the action result stays authoritative).

Caching is configured per resource via `ResourceOptions.cache`
(`{ action?: { enabled, ttl }, http?: { enabled, ttl } }`). HTTP responses and
the action cache share one `listTag` / `recordTag` split so invalidation is
targeted. Core ships `MemoryCacheProvider` (in-process, TTL + tag index) and
`NoopCacheProvider`; Redis lives in `@modern-admin/cache-redis` and carries
cross-instance invalidation over pub/sub — the same channel the WebSocket
realtime events ride.

### Ports

Auth, cache, cross-instance cache, component loading, realtime bus, and
current-admin are **ports**: interfaces in `packages/core/src/ports/`, each
with a no-op or in-memory default plus a real pluggable implementation. Same
for the system stores (`ILogStore`, `IHistoryStore`, `IWebhookStore`,
`IAiTaskStore`, …) — in-memory defaults in `packages/core/src/system/memory.ts`,
real ones in `system-prisma` / `system-drizzle`. When adding a capability,
add the port + default in core, the real implementation in its own package.

### Feature plugins

Two scopes, both transforming `ResourceOptions` by **chaining** hooks (never
overwriting):

- **Local `FeatureFn`** — per resource, in `ResourceWithOptions.features`:
  `uploadFeature`, `historyFeature`, `passwordsFeature`, `m2mFeature`,
  `jsonByKeyFeature`, `actionLoggingFeature`, `aiFillFeature`.
- **Global `GlobalPlugin`** — process-wide, in
  `ModernAdmin({ plugins: [...] })`: `actionLoggingPlugin`, `historyPlugin`,
  `webhookPlugin`.

### Reference apps and the source registry

`apps/_shared` holds the admin config (`@AdminResource` controllers, one
directory per resource) shared by the host apps. Because
`@AdminResource({ source: () => … })` thunks are evaluated during
`ResourcesFactory.buildResources`, and each adapter needs a different raw
source shape, shared controllers reference resources by _logical id_ and
resolve through `apps/_shared/src/admin/source-registry.ts`: the host app calls
`registerAdminSource(id, factory)` at module-load time (before Nest bootstrap)
and controllers declare `source: () => adminSource('customers')`.

### Frontend boundaries

`packages/ui` is i18n-unaware shadcn/Radix primitives. `packages/react` is the
translation boundary and holds hooks, `AdminClient`, routing, pages, the
dashboard, and registries (component/icon/hotkey/extension). `packages/web` is
the pre-built SPA, built twice: `--mode lib` (mountable) and
`--mode standalone` (served by `@modern-admin/nest`'s static-ui middleware).

## Dependency policy (mandatory)

**Always use the latest available stable versions of all libraries.** Before
adding or upgrading a dependency, check the registry for the latest stable
release and pin to it. Never pick an older version to dodge breaking changes —
adapt the code to the new API instead.

Majors currently locked, with the gotchas they impose:

| Package                 | Current major | Notes                                                                          |
| ----------------------- | ------------- | ------------------------------------------------------------------------------ |
| typescript              | 7.x           | native compiler (`tsc` handles both `--noEmit` typecheck and `-p` build emit)  |
| oxlint                  | 1.x           | Rust linter, single root `.oxlintrc.json`; no formatting rules (Prettier does) |
| prettier                | 3.x           | formatter; `.prettierrc.json` (no `;`, single quotes, trailing all, 2-space)   |
| @nestjs/*               | 12.x          | Node 20+; transport package peer dependencies require `^12`                    |
| zod                     | 4.x           | new error API; `z.email()` instead of `.email()`                               |
| vite                    | 8.x           | Node bumped; SSR/Rolldown changes                                              |
| @vitejs/plugin-react    | 6.x           | matches Vite 8                                                                 |
| tailwindcss             | 4.x           | CSS-first config (`@theme`, `@import "tailwindcss"`) — no `tailwind.config.js` |
| react / react-dom       | 19.x          | `import type { ReactElement } from 'react'`, not `JSX.Element`                 |
| @tanstack/react-query   | 5.x           |                                                                                |
| @tanstack/react-router  | 1.x           | browser history via `createBrowserHistory()`; NOT TanStack Start (no SSR)      |
| @tanstack/react-table   | 9.x           | explicit `tableFeatures`; core row model is automatic                          |
| @hookform/resolvers     | 5.x           | API tweaks                                                                     |
| lucide-react            | 1.x           | verify icon names                                                              |
| tailwind-merge          | 3.x           |                                                                                |
| prisma / @prisma/client | 7.x           | new ESM engine, client API changes                                             |
| drizzle-orm             | 0.45.x        | driver API and schema-gen changes                                              |
| better-auth             | 1.7+          | Account identity is the unique `(issuer, accountId)` pair                      |
| graphql                 | 17.x          |                                                                                |
| bullmq                  | 6.x           | queue clients are exposed through `Queue.getBackend()`                         |
| recharts                | 3.x           |                                                                                |

When touching one of those, expect to update call sites for the new API.

## Tooling

- **Package manager / runtime: bun** (`bun install`, `bun add`, `bun run`,
  `bun test`). Never npm/yarn/pnpm. Cross-workspace deps use `workspace:*`.
- **TypeScript** presets in `packages/tsconfig`; each package extends
  `@modern-admin/tsconfig/node.json` or `react.json`. Bun types are
  `"types": ["bun"]` (not `bun-types`).
- **NestJS legacy decorators** (`apps/api-prisma`, `packages/nest`): keep
  `experimentalDecorators`, `emitDecoratorMetadata`,
  `useDefineForClassFields: false`. Related: the oxlint rule
  `typescript/consistent-type-imports` must stay **disabled** (it is off by
  default — do not enable it). Its autofix rewrites constructor param types to
  `import type`, which erases at runtime and breaks Nest DI.
- **Lint + format are mandatory.** After **any** code change run `bun run lint`
  (oxlint over the whole repo; scope one package with `bun run oxlint <path>`)
  and `bun run format` (Prettier), and fix every error; `bun run lint:fix` for
  the mechanical lint ones. Never leave lint red or formatting dirty — CI runs
  `lint` **and** `format:check`. oxlint does **not** enforce formatting; Prettier
  owns it (`.prettierrc.json`: no `;`, single quotes, trailing commas, 2-space,
  spaces inside braces, `printWidth` 100). Do not add or swap a lint/format tool
  without asking. The React-Compiler rule set (`react/set-state-in-effect`,
  `react/static-components`, `react/refs`, …) is deliberately **not** enabled
  (no compiler in this project); only `react/rules-of-hooks` +
  `react/exhaustive-deps` run, on `*.tsx`/`*.jsx`.
- **Tests** live in `<pkg>/test/` and run with `bun test`. Unit tests are
  hermetic — Redis is faked and no Postgres is required. E2E specs live in
  `apps/e2e/tests/` and need docker-compose services + `SEED_DEMO=1` fixtures.
  Those specs are `*.spec.ts`, which matches bun's test glob but explodes under
  bun's runner — the root `bunfig.toml` excludes them via
  `[test] pathIgnorePatterns`, and `apps/e2e` carries a `test` script that just
  points at `bun run e2e`. A workspace holding unit tests must declare
  `"test": "bun test"`, otherwise `bun --filter '*' test` skips it silently.
- **Every new cache entry point needs an invalidation/fencing regression test.**
  Cover the mutation or permission change that makes the value stale, including
  an in-flight read when the entry is tagged.
- **Agent skills** vendored under `.agents/skills/` (`graphql-schema`,
  `graphql-operations` from apollographql, `shadcn`), pinned in
  `skills-lock.json`. Consult them when doing GraphQL schema/operation or
  shadcn component work.

## i18n rule (mandatory)

**No hardcoded user-visible text anywhere.**

- Keys live in `packages/i18n/src/locales/en.ts` (source of truth), mirrored to
  all other locales: `de`, `es`, `fr`, `it`, `ja`, `pl`, `pt-BR`, `ru`.
- `packages/ui` components take an optional `labels?: { … }` prop with English
  fallback defaults so they work standalone in tests/Storybook — they never
  call `useI18n`.
- `packages/react` is the translation boundary: it calls `t('namespace:key')`
  and passes results through `labels` (or a named prop for single strings).
- Adding any new visible string: (1) add to `en.ts`, (2) translate in **all**
  other locale files in the same commit, (3) add/extend the `labels` prop on
  the UI component, (4) wire `t('…')` at the `packages/react` call site.
- Templates use `{placeholder}` and are substituted at the component level:
  `l.uploadingFile.replace('{name}', uploadingName)`.
- `relatedResources[].label` is translatable via the `relatedResources` map in
  `metadataTranslations` (key = resource id), resolved by
  `localizeRelatedResources()`.

## Identifier policy (mandatory)

- **UUID v7 everywhere** (RFC 9562) — primary keys, log entry ids, queue job
  ids, file storage keys, action ids, anything persisted or surfaced. Use
  `uuidv7()` from `@modern-admin/core`
  (`packages/core/src/utils/uuid.ts`). Never `crypto.randomUUID()` (v4),
  `nanoid`, or any non-v7 generator.
- Rationale: v7 is time-ordered — cache- and index-friendly inserts, cheap
  "newest first" listings, natural pagination cursors.
- Prisma `@default(uuid(7))` and Drizzle `defaultRandom()` are **not** v7 in
  current versions. Generate ids in application code and pass them explicitly
  on insert rather than relying on engine defaults.

## Code style

- **Shorten barrel imports.** Drop `/index.js` when importing a directory's
  `index.ts`: `from '../errors'`, not `from '../errors/index.js'`. Concrete
  files keep the extension (`'../utils/merge-options.js'`). Rewrite existing
  long specifiers opportunistically when editing a file.
- Validation is **Zod everywhere** — DTOs, decorator options, form schemas.
- **Mobile-first UI**: base classes target small viewports; `sm:`/`md:`/`lg:`
  enhance. Verify any new screen at ~375px.
- Tailwind 4 has no config file. **Every package scans itself**: its own
  `styles.css` carries `@source "./**/*.{ts,tsx}"` (workspace) plus
  `@source "../src/**/*.{ts,tsx}"` (published, where the file ships from
  `dist/`), and composes upward with `@import "@modern-admin/<pkg>/styles.css"`.
  Never point an `@source` at a _sibling_ package — `@import` resolves package
  specifiers, `@source` does not, so a relative hop across packages silently
  matches zero files under a non-hoisted node_modules layout (bun's isolated
  store, pnpm) and every class used only by that package vanishes. Apps import
  `@modern-admin/react/styles.css`. `border` needs an explicit color — pair it
  with `border-border`.
- Action buttons get a leading `lucide-react` icon when semantics map cleanly
  (`Plus`=create, `Trash2`=delete, `Pencil`=edit, `Eye`=view).
- Custom actions may declare `guard?: string` — a confirmation description
  shown before the action fires. Wire it with `confirmGuard(action, dialogs)`
  from `@modern-admin/react` at **every** invoke call-site (toolbar, bulk bar,
  row dropdown, show page).

## Commits and releases

- Angular **Conventional Commits**: `<type>(<scope>): <subject>` where type is
  `feat | fix | refactor | style | perf | test | docs | chore | build | ci` and
  scope is the affected package (`fix(adapter-prisma): …`).
- Any change to a published package needs a **changeset**: `bun run changeset`.
- Normal feature/fix/docs/chore pull requests target **`develop`**, never
  `main`. `.github/workflows/prepare-release.yml` maintains the Changesets
  version PR against `develop`; `bun run version-packages` also synchronizes
  workspace versions into the lockfile.
- A prepared release is promoted through a `develop` -> `main` pull request
  using a **merge commit** (never squash/rebase). `main` is publish-only and
  `.github/workflows/release.yml` is its sole npm publication path. Full
  public release procedure is in `RELEASING.md`.

## Workflow rules

- Read files before editing them; prefer `Edit` over `Write`.
- Don't create files unless the task requires it.
- Don't create git commits unless asked.
- Don't run destructive commands (`rm -rf`, force-push, hard reset) without
  explicit instruction.
- Match scope: implement what was asked, don't refactor unrelated code.
