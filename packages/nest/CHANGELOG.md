# @modern-admin/nest

## 0.10.0

### Minor Changes

- [#44](https://github.com/modern-admin/modern-admin/pull/44) [`86b07c4`](https://github.com/modern-admin/modern-admin/commit/86b07c45dc99542f0377d86847c3b9636666e16a) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Add collision-free structured filter criteria across core, REST, React, dashboards, and GraphQL. New clients keep operators separate from user values, while core continues to read legacy operator-prefixed strings. Structured numeric and date ranges are translated consistently by both ORM adapters. Prisma empty/non-empty filters now respect database nullability, including required references. GraphQL replaces the legacy `filter` argument with a typed `where` argument. Remove the unused server-branding `logo` and `theme` options.

- [#40](https://github.com/modern-admin/modern-admin/pull/40) [`cd7e365`](https://github.com/modern-admin/modern-admin/commit/cd7e3659dd1a9c08438edbce726694e4244db32c) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Refresh the monorepo to the latest stable dependency lines. Headline: NestJS
  11 -> 12 across every transport package (`nest`, `graphql`, `queue`,
  `realtime`, `feature-upload`) — including `@nestjs/swagger` 12 and
  `@nestjs/bullmq` 12 — which raises the `@nestjs/*` peer range to `^12`, so
  consumers must move to NestJS 12 as well. Also on bun 1.4 (`@types/bun` 1.4).
  
  Other lines bumped to current stable: Prisma 7.10, BullMQ 6.3, better-auth
  1.7.2, Zod 4.5, jose 6.2, TanStack Query/Router/Table, lucide-react 1.37,
  react-hook-form 7.86, TipTap 3.30.5, Vite 8.2.2, and the AI SDK (`ai` 7.0.84).
  Prisma stays on the 7.x stable line (8.0 is still a release candidate).

### Patch Changes

- [#42](https://github.com/modern-admin/modern-admin/pull/42) [`d7ba345`](https://github.com/modern-admin/modern-admin/commit/d7ba3455830e56f86409c912609e22014e04f802) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Move the toolchain to TypeScript 7 and replace ESLint with oxlint + Prettier.
  Dropping `typescript-eslint` (whose peer pinned `typescript <6.1`) unblocked the
  TypeScript 7 native compiler, which now handles both typecheck and build emit.
  This is a build-time change only — no runtime or public API changes; packages
  are rebuilt with the TS 7 compiler.
- Updated dependencies [[`86b07c4`](https://github.com/modern-admin/modern-admin/commit/86b07c45dc99542f0377d86847c3b9636666e16a), [`d7ba345`](https://github.com/modern-admin/modern-admin/commit/d7ba3455830e56f86409c912609e22014e04f802), [`cd7e365`](https://github.com/modern-admin/modern-admin/commit/cd7e3659dd1a9c08438edbce726694e4244db32c)]:
  - @modern-admin/core@0.10.0
  - @modern-admin/feature-upload@0.10.0
  - @modern-admin/i18n@0.10.0
  - @modern-admin/queue@0.10.0

## 0.9.0

### Minor Changes

- [#39](https://github.com/modern-admin/modern-admin/pull/39) [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Consolidate the AI assistant's per-resource `list_<r>` / `show_<r>` /
  `search_<r>` tools into a single parameterized `query_resource({ resourceId,
  action, … })` tool. This cuts a 12-resource setup from ~40 tools to ~8, keeping
  the request payload small enough that OpenAI-compatible providers (notably API
  Stock behind Cloudflare) no longer time out at their gateway (HTTP 524) when the
  large tool list is combined with the schema-hint system prompt. Valid
  resource/action pairs are still advertised in the "Available resources and
  actions" system-prompt line, and unknown resource/action combinations return a
  correctable error instead of failing the call.

- [#39](https://github.com/modern-admin/modern-admin/pull/39) [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Add API Stock as the built-in AI assistant provider and expose a provider-specific API key signup link in assistant settings.

- [#39](https://github.com/modern-admin/modern-admin/pull/39) [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Add webhook-driven API Stock image and video generation, dynamic model forms, private task updates, explicit paid-request confirmation, upload-backed record application, product-card actions, and AI assistant media drafts.

- [#39](https://github.com/modern-admin/modern-admin/pull/39) [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Add opt-in debug logging for the model/prompt sent to providers. Media
  generation logs the provider, model, and input via the `mediaGeneration.debug`
  option or `MEDIA_GENERATION_DEBUG`; the AI assistant now also logs the system
  prompt and chat messages sent to the LLM under the existing `aiAssistant.debug`
  / `AI_ASSISTANT_DEBUG` flag.
  
  Also clarify AI assistant failures when API Stock (behind Cloudflare) returns a
  non-JSON gateway error such as HTTP 524: instead of an empty `AI_APICallError`,
  the task now fails with an explicit "API Stock request failed with HTTP <status>"
  message so upstream timeouts are diagnosable.

- [#39](https://github.com/modern-admin/modern-admin/pull/39) [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Support media generation without a public webhook in local development. When
  `webhookBaseUrl` is not configured and `NODE_ENV` is not `production`, the
  server submits the provider request without a webhook and polls `getStatus`
  until the task finishes, instead of failing with a `412` Precondition Failed.
  In production the webhook remains mandatory: a missing `webhookBaseUrl` is
  rejected up front, before any task is created. `MediaGenerationCreateInput.webhookUrl`
  is now optional. The poll loop re-checks the task status before applying a
  provider result, so cancelling ("stop waiting") while a `getStatus` request is
  in flight can no longer resurrect the task into `succeeded`. On startup the
  service re-arms polling for any webhook-less task still `running`, so a process
  restart (frequent in local `--watch` dev) no longer freezes it forever.

### Patch Changes

- [#36](https://github.com/modern-admin/modern-admin/pull/36) [`e6d85ae`](https://github.com/modern-admin/modern-admin/commit/e6d85ae69aa955b56f385fa20b451cb3766d3c29) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Close media generation apply/cancel/budget race conditions.
  
  - **Apply is serialized per task.** Two overlapping apply requests for the same
    task could both pass the `output.applied` guard and upload/edit twice; they
    are chained in-process and the second observes the first's marker.
  - **Completion never overwrites cancellation.** `IAiTaskStore.updateStatus`
    gains an optional `expectedStatus` guard so a status write is applied
    atomically only while the task is still in one of the expected states (a
    `WHERE status IN (…)` predicate for SQL stores, a synchronous check-and-set
    in memory). `applyProviderResult` uses it, so a cancel that lands while a
    provider status request is in flight can no longer resurrect the task as
    succeeded/failed — including across nodes on the webhook path.
  - **The monthly budget reserves before it checks, one request at a time.** The
    task is enqueued with its estimated cost before the budget is summed, and
    per-user reservations are serialized so concurrent requests near the limit are
    admitted one-by-one — exactly one is accepted rather than all overspending or
    all rejecting. A rejected reservation is failed so its cost stops counting.
- Updated dependencies [[`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db), [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db), [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db), [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db), [`e6d85ae`](https://github.com/modern-admin/modern-admin/commit/e6d85ae69aa955b56f385fa20b451cb3766d3c29), [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db), [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db), [`eb83e7a`](https://github.com/modern-admin/modern-admin/commit/eb83e7a9544faef49416d4510a8d21ed6ea6b565)]:
  - @modern-admin/i18n@0.9.0
  - @modern-admin/core@0.9.0
  - @modern-admin/queue@0.9.0
  - @modern-admin/feature-upload@0.9.0

## 0.8.0

### Minor Changes

- [#21](https://github.com/modern-admin/modern-admin/pull/21) [`b8ad7c2`](https://github.com/modern-admin/modern-admin/commit/b8ad7c2f97a84fe02c66c6992d4d11d0b65e44b9) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Add injectable LLM, admin-client, authentication-route, telemetry, and AI queue
  boundaries; move the shared framework DI token to core; decouple GraphQL from
  the REST transport; and make upload transport dependencies optional peers.

### Patch Changes

- Updated dependencies [[`b8ad7c2`](https://github.com/modern-admin/modern-admin/commit/b8ad7c2f97a84fe02c66c6992d4d11d0b65e44b9)]:
  - @modern-admin/core@0.8.0
  - @modern-admin/i18n@0.8.0

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
  - @modern-admin/i18n@0.7.0
  - @modern-admin/telemetry@0.7.0

## 0.6.0

### Patch Changes

- [`3d2a207`](https://github.com/modern-admin/modern-admin/commit/3d2a2077a466e87da55bf162dcafdb9a8b9bd652) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Refresh the monorepo to the latest stable dependency lines, including
  TypeScript 7, Vite 8.2, TanStack Table 9, BullMQ 6, ioredis 6, Prisma 7.9,
  NestJS 11.2, and the current React/UI toolchain. The table integration now
  uses TanStack Table 9's explicit feature API, and the queue lock processor uses
  BullMQ 6's backend client API. TypeScript 6 remains installed only as the
  temporary JavaScript Compiler API compatibility layer required by ESLint and
  declaration tooling while project compilation runs on TypeScript 7.
- Updated dependencies [[`3d2a207`](https://github.com/modern-admin/modern-admin/commit/3d2a2077a466e87da55bf162dcafdb9a8b9bd652)]:
  - @modern-admin/core@0.6.0
  - @modern-admin/i18n@0.6.0
  - @modern-admin/queue@0.6.0
  - @modern-admin/telemetry@0.6.0

## 0.5.0

### Minor Changes

- [`4251f7a`](https://github.com/modern-admin/modern-admin/commit/4251f7a6ea01ad80fbd5515a27cec2e138d2ccb5) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Harden server caching across processes and expose cache observability.

  - Route all framework reads, writes, and invalidations through a fail-open
    `CacheRuntime` with tag-generation fencing, invalidation retry/quarantine,
    TTL jitter, metrics, and optional distributed single-flight locks.
  - Make Redis value/tag/reverse-index writes atomic, add cross-instance tag
    epochs, token-safe locks, exact delete/overwrite cleanup, and monotonic tag
    TTLs.
  - Version and canonicalize action and HTTP keys, fix bounded in-memory LRU tag
    semantics, and actively revoke cached role permissions across replicas.
  - Scope HTTP entries per principal, bypass dynamic access predicates, and tie
    cached responses to role-permission invalidation.
  - Add protected cache stats/reset/resource-invalidation endpoints and a
    localized Cache diagnostics screen.

- [`4251f7a`](https://github.com/modern-admin/modern-admin/commit/4251f7a6ea01ad80fbd5515a27cec2e138d2ccb5) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Harden server caching across processes and expose cache observability.

- [`4251f7a`](https://github.com/modern-admin/modern-admin/commit/4251f7a6ea01ad80fbd5515a27cec2e138d2ccb5) Thanks [@SergiyIva](https://github.com/SergiyIva)! - List view refresh now bypasses the server cache

  The refresh button used to only refetch the client-side query — within the
  HTTP/action cache TTL the server replayed the very entry the user was trying
  to get past, so "refresh" could show stale rows.

  It now sends `Cache-Control: no-cache`, which the REST layer forwards as
  `ActionRequest.refresh`. The list action reads straight from the database,
  compares the result with what was cached, and — only when the rows actually
  moved — invalidates the resource's server-side caches (list, records and
  dependent resources) before storing the fresh response. Unchanged data is
  served as-is, so a refresh no longer costs neighbouring cached scopes.

  - `core`: `CacheRuntimeReadOptions` gains `refresh` / `onChanged`;
    `ActionRequest` gains `refresh`.
  - `nest`: the HTTP cache interceptor honours `Cache-Control: no-cache`
    (`x-cache: REVALIDATED`) instead of serving a HIT.
  - `react`: `AdminClient.list()` takes `{ refresh }`, and the new
    `useRefreshRecords()` hook drives the list view's refresh button and `R`
    hotkey.

### Patch Changes

- Updated dependencies [[`4251f7a`](https://github.com/modern-admin/modern-admin/commit/4251f7a6ea01ad80fbd5515a27cec2e138d2ccb5), [`4251f7a`](https://github.com/modern-admin/modern-admin/commit/4251f7a6ea01ad80fbd5515a27cec2e138d2ccb5), [`4251f7a`](https://github.com/modern-admin/modern-admin/commit/4251f7a6ea01ad80fbd5515a27cec2e138d2ccb5), [`4251f7a`](https://github.com/modern-admin/modern-admin/commit/4251f7a6ea01ad80fbd5515a27cec2e138d2ccb5)]:
  - @modern-admin/core@0.5.0
  - @modern-admin/i18n@0.5.0
  - @modern-admin/telemetry@0.5.0

## 0.4.2

### Patch Changes

- Updated dependencies [[`21f3457`](https://github.com/modern-admin/modern-admin/commit/21f3457c8260279be5055bc1f7a76be3ea5fee46), [`21f3457`](https://github.com/modern-admin/modern-admin/commit/21f3457c8260279be5055bc1f7a76be3ea5fee46)]:
  - @modern-admin/i18n@0.4.2

## 0.4.1

### Patch Changes

- Updated dependencies [[`d39e559`](https://github.com/modern-admin/modern-admin/commit/d39e559e5e1cdf9fdbba9cd53f3cdf386af6baee), [`d39e559`](https://github.com/modern-admin/modern-admin/commit/d39e559e5e1cdf9fdbba9cd53f3cdf386af6baee)]:
  - @modern-admin/core@0.4.1
  - @modern-admin/telemetry@0.4.1

## 0.3.5

### Patch Changes

- Updated dependencies [[`fecfa57`](https://github.com/modern-admin/modern-admin/commit/fecfa57a818df221ed21c4bc7ecc12f0a99dbd83), [`fecfa57`](https://github.com/modern-admin/modern-admin/commit/fecfa57a818df221ed21c4bc7ecc12f0a99dbd83)]:
  - @modern-admin/core@0.3.5
  - @modern-admin/telemetry@0.3.5

## 0.3.4

### Patch Changes

- [`596ad7d`](https://github.com/modern-admin/modern-admin/commit/596ad7dd27ec3da2538afcbeb342cac1e707c8e5) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Fixed sidebar animations performance and resource actions config

- Updated dependencies [[`596ad7d`](https://github.com/modern-admin/modern-admin/commit/596ad7dd27ec3da2538afcbeb342cac1e707c8e5)]:
  - @modern-admin/core@0.3.4
  - @modern-admin/i18n@0.3.4
  - @modern-admin/telemetry@0.3.4

## 0.3.3

### Patch Changes

- Updated dependencies [[`e92a998`](https://github.com/modern-admin/modern-admin/commit/e92a9983cdd14125ebb4dd0cd9f8062216d18a5c)]:
  - @modern-admin/core@0.3.3
  - @modern-admin/telemetry@0.3.3

## 0.3.2

### Patch Changes

- Updated dependencies [[`cdc8639`](https://github.com/modern-admin/modern-admin/commit/cdc86393f211e8d10b856d9091baa910a11e739f)]:
  - @modern-admin/core@0.3.2
  - @modern-admin/i18n@0.3.2
  - @modern-admin/telemetry@0.3.2

## 0.3.0

### Minor Changes

- [`69606d4`](https://github.com/modern-admin/modern-admin/commit/69606d4c2e2ee6204dde978fa59e4454e3ca7ac2) Thanks [@SergiyIva](https://github.com/SergiyIva)! - harden search fallback scan, avoid payload mutation in json-by-key, paginate cache invalidateTags, and make history writes fire-and-forget

### Patch Changes

- Updated dependencies [[`69606d4`](https://github.com/modern-admin/modern-admin/commit/69606d4c2e2ee6204dde978fa59e4454e3ca7ac2), [`69606d4`](https://github.com/modern-admin/modern-admin/commit/69606d4c2e2ee6204dde978fa59e4454e3ca7ac2), [`69606d4`](https://github.com/modern-admin/modern-admin/commit/69606d4c2e2ee6204dde978fa59e4454e3ca7ac2)]:
  - @modern-admin/core@0.3.0
  - @modern-admin/queue@0.3.0
  - @modern-admin/i18n@0.3.0
  - @modern-admin/telemetry@0.3.0

## 0.2.1

### Patch Changes

- [`68ee72e`](https://github.com/modern-admin/modern-admin/commit/68ee72e721babf28158274b6fe98e3af8148cf92) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Republish with correct internal dependency ranges. 0.2.0 was published with internal `@modern-admin/*` dependencies pinned to the stale exact version `0.1.1` (bun substitutes `workspace:` ranges from a bun.lock that `changeset version` had not refreshed), which broke consumers with nested-copy resolution errors (`Export named 'recordsTag' not found`). Internal ranges are now published as `^<version>` (`workspace:^`), the release pipeline syncs bun.lock workspace versions after versioning, and publishing aborts if a packed tarball carries a wrong internal range.

- [`68ee72e`](https://github.com/modern-admin/modern-admin/commit/68ee72e721babf28158274b6fe98e3af8148cf92) Thanks [@SergiyIva](https://github.com/SergiyIva)! - fixed changeset version upgrade of packages

- Updated dependencies [[`68ee72e`](https://github.com/modern-admin/modern-admin/commit/68ee72e721babf28158274b6fe98e3af8148cf92), [`68ee72e`](https://github.com/modern-admin/modern-admin/commit/68ee72e721babf28158274b6fe98e3af8148cf92)]:
  - @modern-admin/core@0.2.1
  - @modern-admin/i18n@0.2.1
  - @modern-admin/queue@0.2.1
  - @modern-admin/telemetry@0.2.1

## 0.2.0

### Minor Changes

- [`64f17a6`](https://github.com/modern-admin/modern-admin/commit/64f17a63626ab2990aee38fb035469aed8992e99) Thanks [@SergiyIva](https://github.com/SergiyIva)! - cache layer, realtime updates and bundle enhanced

### Patch Changes

- Updated dependencies [[`64f17a6`](https://github.com/modern-admin/modern-admin/commit/64f17a63626ab2990aee38fb035469aed8992e99)]:
  - @modern-admin/core@0.2.0
  - @modern-admin/telemetry@0.2.0

## 0.1.1

### Patch Changes

- [`c151019`](https://github.com/modern-admin/modern-admin/commit/c151019f159f41c1574ae6993f582bfd21987983) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Add npm package metadata: a per-package README (install + links back to the Modern Admin repo) plus `homepage` and `keywords` fields for better discoverability on npm.

- Updated dependencies [[`c151019`](https://github.com/modern-admin/modern-admin/commit/c151019f159f41c1574ae6993f582bfd21987983)]:
  - @modern-admin/core@0.1.1
  - @modern-admin/i18n@0.1.1
  - @modern-admin/queue@0.1.1
  - @modern-admin/telemetry@0.1.1
