# @modern-admin/auth-better-auth

## 0.12.0

### Patch Changes

- [#78](https://github.com/modern-admin/modern-admin/pull/78) [`b0fc742`](https://github.com/modern-admin/modern-admin/commit/b0fc742d9d41fbee10ad18ee3d827cecd342496a) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Fix API keys with an expiry, gate the time-series endpoint, and charge each
  API-key request once against the key's rate limit.
  
  - **`ApiKeysController` sent the expiry in milliseconds.** Better Auth's
    api-key plugin takes `expiresIn` in seconds, so every key with an expiry was
    rejected as `EXPIRES_IN_IS_TOO_LARGE` and surfaced as a 500. `expiresInDays`
    is now converted to seconds (`IApiKeyService` documents the unit), and a
    Better Auth 4xx rejection keeps its status and `code` instead of becoming a
    500 on create and update.
  - **`POST /admin/api/timeseries` checked no permissions.** It aggregated any
    resource for any signed-in user, bypassing the role matrix and
    `isAccessible`. It now requires `canAccess(resource, 'list')` and read access
    to `dateField` / `field` / `groupBy` (403 otherwise), and resolves FK labels
    only from resources the caller may list.
  - **Each API-key request consumed two rate-limit slots.** `getSession` already
    verifies the key; `BetterAuthProvider` then called `verifyApiKey` again,
    halving the plugin's limit and quota. The provider now reads the key's row by
    id through `auth.$context` and falls back to `verifyApiKey` only when the row
    is not in the database. A key that Better Auth rejects inside `getSession`
    (rate limit, expiry) now yields 401 instead of an unhandled error.

- [#78](https://github.com/modern-admin/modern-admin/pull/78) [`b0fc742`](https://github.com/modern-admin/modern-admin/commit/b0fc742d9d41fbee10ad18ee3d827cecd342496a) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Security: API keys no longer act with their owner's full role outside the action gate.
  
  Better Auth's api-key plugin turns a key into a session of its owner; only the
  `apiKey` claim narrows that session, and only `ModernAdmin.invoke()` /
  `canAccess()` read it. Two paths let a scoped key escape:
  
  - **`BetterAuthProvider.getCurrentUser` failed open.** When `verifyApiKey`
    threw or reported the key invalid — which is exactly what happens once the
    plugin's rate limit or `remaining` quota trips, since `getSession` and
    `verifyApiKey` each consume a slot — the principal was returned without the
    claim, i.e. with the owner's unrestricted role. It now returns `null` in that
    case, when the api-key plugin is not mounted, and when the verified key is
    not the one the session was minted from. New `apiKeyHeaders` option mirrors
    the plugin's setting (default `'x-api-key'`).
  - **Endpoints outside `invoke()` ignored the key's scope.** Audit log, record
    history, webhooks, dashboard, analytics, AI assistant and media generation
    served a key like its owner's session. `ModernAdminAuthGuard` now answers 403
    to API-key principals unless the route is marked with the new
    `@AllowApiKey()` decorator; resource actions, global search and
    `GET /admin/api/auth/me` are marked. Host controllers behind the guard are
    closed to keys until they opt in.
  - **Better Auth's own endpoints accepted keys.** `createBetterAuthMiddleware`
    now answers 403 (`API_KEY_NOT_ALLOWED`) to any request presenting an API key
    on Better Auth paths, so a key can no longer read `/get-session`,
    `/list-sessions` (the owner's live session tokens) or mint an unrestricted
    key via `/api-key/create`. Pass `{ apiKeyHeaders }` for custom key headers,
    and mount Better Auth through this middleware rather than a bare
    `toNodeHandler(auth)`.

- [#98](https://github.com/modern-admin/modern-admin/pull/98) [`29c3a22`](https://github.com/modern-admin/modern-admin/commit/29c3a220a81cfa7018eada015fa6644edadab720) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Update external dependencies to the latest stable releases and pin the tested
  versions across packages and generated projects. Refresh the lockfile, move form
  resolvers to v6, and keep TypeScript 7 declaration builds working with the
  TypeScript 6 API alias and an updated unplugin-dts patch.
  
  Align Better Auth lookup indexes across the canonical Prisma and Drizzle
  schemas, reference app, and CLI scaffold. Existing installations should add
  missing indexes through their ORM migration workflow; the Prisma generator
  preserves existing models. The 1.7.5 → 1.7.12 upgrade itself adds no columns.
  
  Include `prisma.config.ts` in generated hosts so Prisma 7 database commands
  receive `DATABASE_URL` and the configured migration directory.

- [#78](https://github.com/modern-admin/modern-admin/pull/78) [`b0fc742`](https://github.com/modern-admin/modern-admin/commit/b0fc742d9d41fbee10ad18ee3d827cecd342496a) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Recognize API-key requests through Better Auth's own plugin matchers, preventing
  custom header configuration mismatches from bypassing action scopes or reaching
  account-management endpoints. `createBetterAuthMiddleware` now requires the same
  Better Auth instance via `{ auth }`; update existing middleware mounts accordingly.
  
  Limit built-in API-key opt-ins to individual resource/search handlers, keeping
  future controller methods closed by default. Translate API-key and time-series
  permission errors using Accept-Language and all nine bundled locales.

- [#94](https://github.com/modern-admin/modern-admin/pull/94) [`4b4553e`](https://github.com/modern-admin/modern-admin/commit/4b4553eb0c0fc974aef60e05935c41f7164bd528) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Recover exact repeats of completed web OAuth callbacks instead of failing with
  `state_mismatch`. Export `oauthCallbackReplayPlugin()` and enable it in the
  reference auth factory and generated hosts. Recovery requires a short-lived
  signed receipt and the same active server-side session; normal state validation,
  revocation, and account restrictions remain in force.
- Updated dependencies [[`29c3a22`](https://github.com/modern-admin/modern-admin/commit/29c3a220a81cfa7018eada015fa6644edadab720), [`6a24e6d`](https://github.com/modern-admin/modern-admin/commit/6a24e6d6e0fcfac2f17b38191ac7543912773ed1)]:
  - @modern-admin/core@0.12.0

## 0.11.0

### Patch Changes

- [#63](https://github.com/modern-admin/modern-admin/pull/63) [`f0aa056`](https://github.com/modern-admin/modern-admin/commit/f0aa0564aae700ca7b83746087bf6fb7911e3dc6) Thanks [@dependabot](https://github.com/apps/dependabot)! - Update @types/bun to 1.4.2, bullmq to 6.3.8, @types/node to 26.6.2, @changesets/changelog-github to 1.0.1, @changesets/cli to 3.0.3, zod to 4.6.5, jose to 6.2.12, @scalar/nestjs-api-reference to 1.2.19, lucide-react to 1.47.0, dompurify to 3.4.15, marked to 18.0.13 and validate compatibility with the current stable releases.

- [#64](https://github.com/modern-admin/modern-admin/pull/64) [`725ca81`](https://github.com/modern-admin/modern-admin/commit/725ca8179ba34ecdf112a32c437ae03f83c68009) Thanks [@dependabot](https://github.com/apps/dependabot)! - Update Better Auth to 1.7.5 and preserve existing issuer-based account schemas with the accountIdentityPlugin. Use Prisma delegate names for schema validation and UUID v7 for generated auth identifiers in reference and scaffolded apps.
- Updated dependencies [[`f0aa056`](https://github.com/modern-admin/modern-admin/commit/f0aa0564aae700ca7b83746087bf6fb7911e3dc6), [`8b8b07e`](https://github.com/modern-admin/modern-admin/commit/8b8b07e152701cdcaa2c7c7f53704b3610787811), [`9ec58d8`](https://github.com/modern-admin/modern-admin/commit/9ec58d8945d3b2aa1f720d371cef371900db1def)]:
  - @modern-admin/core@0.11.0

## 0.10.0

### Patch Changes

- [#42](https://github.com/modern-admin/modern-admin/pull/42) [`d7ba345`](https://github.com/modern-admin/modern-admin/commit/d7ba3455830e56f86409c912609e22014e04f802) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Move the toolchain to TypeScript 7 and replace ESLint with oxlint + Prettier.
  Dropping `typescript-eslint` (whose peer pinned `typescript <6.1`) unblocked the
  TypeScript 7 native compiler, which now handles both typecheck and build emit.
  This is a build-time change only — no runtime or public API changes; packages
  are rebuilt with the TS 7 compiler.

- [#40](https://github.com/modern-admin/modern-admin/pull/40) [`cd7e365`](https://github.com/modern-admin/modern-admin/commit/cd7e3659dd1a9c08438edbce726694e4244db32c) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Refresh the monorepo to the latest stable dependency lines. Headline: NestJS
  11 -> 12 across every transport package (`nest`, `graphql`, `queue`,
  `realtime`, `feature-upload`) — including `@nestjs/swagger` 12 and
  `@nestjs/bullmq` 12 — which raises the `@nestjs/*` peer range to `^12`, so
  consumers must move to NestJS 12 as well. Also on bun 1.4 (`@types/bun` 1.4).
  
  Other lines bumped to current stable: Prisma 7.10, BullMQ 6.3, better-auth
  1.7.2, Zod 4.5, jose 6.2, TanStack Query/Router/Table, lucide-react 1.37,
  react-hook-form 7.86, TipTap 3.30.5, Vite 8.2.2, and the AI SDK (`ai` 7.0.84).
  Prisma stays on the 7.x stable line (8.0 is still a release candidate).
- Updated dependencies [[`86b07c4`](https://github.com/modern-admin/modern-admin/commit/86b07c45dc99542f0377d86847c3b9636666e16a), [`d7ba345`](https://github.com/modern-admin/modern-admin/commit/d7ba3455830e56f86409c912609e22014e04f802), [`cd7e365`](https://github.com/modern-admin/modern-admin/commit/cd7e3659dd1a9c08438edbce726694e4244db32c)]:
  - @modern-admin/core@0.10.0

## 0.9.0

### Patch Changes

- Updated dependencies [[`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db), [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db), [`e6d85ae`](https://github.com/modern-admin/modern-admin/commit/e6d85ae69aa955b56f385fa20b451cb3766d3c29), [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db), [`eb83e7a`](https://github.com/modern-admin/modern-admin/commit/eb83e7a9544faef49416d4510a8d21ed6ea6b565)]:
  - @modern-admin/core@0.9.0

## 0.8.0

### Patch Changes

- Updated dependencies [[`b8ad7c2`](https://github.com/modern-admin/modern-admin/commit/b8ad7c2f97a84fe02c66c6992d4d11d0b65e44b9)]:
  - @modern-admin/core@0.8.0

## 0.7.0

### Minor Changes

- [#26](https://github.com/modern-admin/modern-admin/pull/26) [`18a001e`](https://github.com/modern-admin/modern-admin/commit/18a001e875d4c5fa4b56592fbe9b1b54f9191558) Thanks [@zingerman-dev](https://github.com/zingerman-dev)! - Implement the 22 findings from the v0.5.0 audit: supported whitelabeling and UI-string
  overrides, an access-filtered and authenticated `/admin/api/config`, accessible names on the
  record editor, and the removal of nine declared-but-never-read public options.
  
  Contains behaviour changes that need a conscious upgrade:
  
  - `GET /admin/api/config` now requires a session. Its anonymous branch also no longer skips
    the `isAccessible` / `isVisible` filtering the authenticated branch performed, so an
    anonymous caller can never see more of the schema than an authenticated one. Opt back into
    anonymous access with `ModernAdminModule.forRoot({ publicConfig: true })`.
  - `ModernAdminModule.forRootAsync` takes an explicit `aiAssistant?: boolean` and throws at
    boot when it disagrees with the options the factory returned. Hosts that configure the AI
    assistant asynchronously must add `aiAssistant: true`.
  - `?sortBy=` is validated against `isSortable()` and returns 400 instead of reaching the ORM.
  - `IQueryableLogStore.list()` defaults to 50 rows in both shipped stores.
  - Production source maps are off by default (`AdminAppConfigOptions.sourcemap`), and `.map`
    files are excluded from the `@modern-admin/web` tarball.
  - `ModernAdminStaticUiModule` rejects a root mount (`path: '/'`) at boot.
  - The HTTP cache interceptor is bound to the admin controllers instead of `APP_INTERCEPTOR`.
  - `TimeSeriesQuery.filters` is removed and `StreamOptions.cursor` throws in the offset-based
    base implementation, rather than both being silently ignored.
  
  Covered by 30 new tests across core, nest, adapter-prisma and system-prisma.

### Patch Changes

- Updated dependencies [[`18a001e`](https://github.com/modern-admin/modern-admin/commit/18a001e875d4c5fa4b56592fbe9b1b54f9191558)]:
  - @modern-admin/core@0.7.0

## 0.6.0

### Minor Changes

- [`3d2a207`](https://github.com/modern-admin/modern-admin/commit/3d2a2077a466e87da55bf162dcafdb9a8b9bd652) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Require Better Auth 1.7 and adopt its account identity contract across the
  Prisma fragment, Drizzle schema, reference app, and generated scaffold.
  Credential accounts now use `issuer: 'local:credential'`, account identity is
  unique by `(issuer, accountId)`, and adapter-specific PostgreSQL migrations
  backfill populated 1.6 installations while failing closed on unknown providers
  or collisions. Stop authentication writes before running the migration.

### Patch Changes

- Updated dependencies [[`3d2a207`](https://github.com/modern-admin/modern-admin/commit/3d2a2077a466e87da55bf162dcafdb9a8b9bd652)]:
  - @modern-admin/core@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [[`4251f7a`](https://github.com/modern-admin/modern-admin/commit/4251f7a6ea01ad80fbd5515a27cec2e138d2ccb5), [`4251f7a`](https://github.com/modern-admin/modern-admin/commit/4251f7a6ea01ad80fbd5515a27cec2e138d2ccb5), [`4251f7a`](https://github.com/modern-admin/modern-admin/commit/4251f7a6ea01ad80fbd5515a27cec2e138d2ccb5)]:
  - @modern-admin/core@0.5.0

## 0.4.1

### Patch Changes

- Updated dependencies [[`d39e559`](https://github.com/modern-admin/modern-admin/commit/d39e559e5e1cdf9fdbba9cd53f3cdf386af6baee), [`d39e559`](https://github.com/modern-admin/modern-admin/commit/d39e559e5e1cdf9fdbba9cd53f3cdf386af6baee)]:
  - @modern-admin/core@0.4.1

## 0.3.5

### Patch Changes

- Updated dependencies [[`fecfa57`](https://github.com/modern-admin/modern-admin/commit/fecfa57a818df221ed21c4bc7ecc12f0a99dbd83), [`fecfa57`](https://github.com/modern-admin/modern-admin/commit/fecfa57a818df221ed21c4bc7ecc12f0a99dbd83)]:
  - @modern-admin/core@0.3.5

## 0.3.4

### Patch Changes

- Updated dependencies [[`596ad7d`](https://github.com/modern-admin/modern-admin/commit/596ad7dd27ec3da2538afcbeb342cac1e707c8e5)]:
  - @modern-admin/core@0.3.4

## 0.3.3

### Patch Changes

- Updated dependencies [[`e92a998`](https://github.com/modern-admin/modern-admin/commit/e92a9983cdd14125ebb4dd0cd9f8062216d18a5c)]:
  - @modern-admin/core@0.3.3

## 0.3.2

### Patch Changes

- Updated dependencies [[`cdc8639`](https://github.com/modern-admin/modern-admin/commit/cdc86393f211e8d10b856d9091baa910a11e739f)]:
  - @modern-admin/core@0.3.2

## 0.3.0

### Minor Changes

- [`69606d4`](https://github.com/modern-admin/modern-admin/commit/69606d4c2e2ee6204dde978fa59e4454e3ca7ac2) Thanks [@SergiyIva](https://github.com/SergiyIva)! - harden search fallback scan, avoid payload mutation in json-by-key, paginate cache invalidateTags, and make history writes fire-and-forget

### Patch Changes

- Updated dependencies [[`69606d4`](https://github.com/modern-admin/modern-admin/commit/69606d4c2e2ee6204dde978fa59e4454e3ca7ac2), [`69606d4`](https://github.com/modern-admin/modern-admin/commit/69606d4c2e2ee6204dde978fa59e4454e3ca7ac2), [`69606d4`](https://github.com/modern-admin/modern-admin/commit/69606d4c2e2ee6204dde978fa59e4454e3ca7ac2)]:
  - @modern-admin/core@0.3.0

## 0.2.1

### Patch Changes

- [`68ee72e`](https://github.com/modern-admin/modern-admin/commit/68ee72e721babf28158274b6fe98e3af8148cf92) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Republish with correct internal dependency ranges. 0.2.0 was published with internal `@modern-admin/*` dependencies pinned to the stale exact version `0.1.1` (bun substitutes `workspace:` ranges from a bun.lock that `changeset version` had not refreshed), which broke consumers with nested-copy resolution errors (`Export named 'recordsTag' not found`). Internal ranges are now published as `^<version>` (`workspace:^`), the release pipeline syncs bun.lock workspace versions after versioning, and publishing aborts if a packed tarball carries a wrong internal range.

- [`68ee72e`](https://github.com/modern-admin/modern-admin/commit/68ee72e721babf28158274b6fe98e3af8148cf92) Thanks [@SergiyIva](https://github.com/SergiyIva)! - fixed changeset version upgrade of packages

- Updated dependencies [[`68ee72e`](https://github.com/modern-admin/modern-admin/commit/68ee72e721babf28158274b6fe98e3af8148cf92)]:
  - @modern-admin/core@0.2.1

## 0.2.0

### Patch Changes

- Updated dependencies [[`64f17a6`](https://github.com/modern-admin/modern-admin/commit/64f17a63626ab2990aee38fb035469aed8992e99)]:
  - @modern-admin/core@0.2.0

## 0.1.1

### Patch Changes

- [`c151019`](https://github.com/modern-admin/modern-admin/commit/c151019f159f41c1574ae6993f582bfd21987983) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Add npm package metadata: a per-package README (install + links back to the Modern Admin repo) plus `homepage` and `keywords` fields for better discoverability on npm.

- Updated dependencies [[`c151019`](https://github.com/modern-admin/modern-admin/commit/c151019f159f41c1574ae6993f582bfd21987983)]:
  - @modern-admin/core@0.1.1
