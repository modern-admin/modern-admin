# @modern-admin/core

## 0.9.0

### Minor Changes

- [#30](https://github.com/modern-admin/modern-admin/pull/30) [`69f6c5d`](https://github.com/modern-admin/modern-admin/commit/69f6c5d5c8850c1b6bcf314284127d97a9975126) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Add webhook-driven API Stock image and video generation, dynamic model forms, private task updates, explicit paid-request confirmation, upload-backed record application, product-card actions, and AI assistant media drafts.

- [#33](https://github.com/modern-admin/modern-admin/pull/33) [`42d36b0`](https://github.com/modern-admin/modern-admin/commit/42d36b09166f23ad8ac644c4aead2341c13f25b2) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Gate creation UI by the server-advertised `new` action and show a forbidden state for direct creation URLs when the action is unavailable.
  
  Add creation-specific property visibility and ordering through `isVisible.new` and `newProperties`, with backwards-compatible fallback to the edit view, and replace empty creation/edit forms with a localized empty state without a submit action.

- [#30](https://github.com/modern-admin/modern-admin/pull/30) [`69f6c5d`](https://github.com/modern-admin/modern-admin/commit/69f6c5d5c8850c1b6bcf314284127d97a9975126) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Support media generation without a public webhook in local development. When
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

## 0.8.0

### Minor Changes

- [#21](https://github.com/modern-admin/modern-admin/pull/21) [`b8ad7c2`](https://github.com/modern-admin/modern-admin/commit/b8ad7c2f97a84fe02c66c6992d4d11d0b65e44b9) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Add injectable LLM, admin-client, authentication-route, telemetry, and AI queue
  boundaries; move the shared framework DI token to core; decouple GraphQL from
  the REST transport; and make upload transport dependencies optional peers.

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

## 0.6.0

### Patch Changes

- [`3d2a207`](https://github.com/modern-admin/modern-admin/commit/3d2a2077a466e87da55bf162dcafdb9a8b9bd652) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Refresh the monorepo to the latest stable dependency lines, including
  TypeScript 7, Vite 8.2, TanStack Table 9, BullMQ 6, ioredis 6, Prisma 7.9,
  NestJS 11.2, and the current React/UI toolchain. The table integration now
  uses TanStack Table 9's explicit feature API, and the queue lock processor uses
  BullMQ 6's backend client API. TypeScript 6 remains installed only as the
  temporary JavaScript Compiler API compatibility layer required by ESLint and
  declaration tooling while project compilation runs on TypeScript 7.

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

## 0.4.1

### Patch Changes

- [`d39e559`](https://github.com/modern-admin/modern-admin/commit/d39e559e5e1cdf9fdbba9cd53f3cdf386af6baee) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Stop `datetime` values drifting by the browser↔server timezone offset on save.

  `DatePicker` in `mode="datetime"` emitted browser-local wall time with no
  offset (`2026-08-04T15:00`). Per spec, `new Date(...)` resolves an offset-less
  date-time in the _running process's_ timezone, so the Prisma adapter stored a
  different instant than the user picked whenever the two timezones differed —
  and because the show/edit views render the instant back in browser-local time,
  re-saving an untouched record shifted it again. With a browser on UTC+3 and an
  API on UTC (the default in a plain Docker image), three hours were added per
  round trip.

  - `@modern-admin/ui` now emits a full UTC instant (`toISOString()`) for
    datetime. The visible text input keeps its human-readable
    `yyyy-MM-dd HH:mm` shape; only the wire format changed. `mode="date"` is
    unaffected — a bare `yyyy-MM-dd` is already spec'd to parse as UTC midnight.
  - `@modern-admin/core` exports `parseDateValue`, which reads an offset-less
    date-time as UTC instead of inheriting `process.env.TZ`, and uses it when
    coercing filter values. `@modern-admin/adapter-prisma` uses it when
    normalising `DateTime` writes. Explicit offsets (`Z`, `+03:00`) are honoured
    as given. This keeps older clients, form posts and hand-written API calls
    correct without depending on deployment config.

- [`d39e559`](https://github.com/modern-admin/modern-admin/commit/d39e559e5e1cdf9fdbba9cd53f3cdf386af6baee) Thanks [@SergiyIva](https://github.com/SergiyIva)! - fixed timezone gap, filter list by default

## 0.3.5

### Patch Changes

- [`fecfa57`](https://github.com/modern-admin/modern-admin/commit/fecfa57a818df221ed21c4bc7ecc12f0a99dbd83) Thanks [@SergiyIva](https://github.com/SergiyIva)! - fixed flat array

- [`fecfa57`](https://github.com/modern-admin/modern-admin/commit/fecfa57a818df221ed21c4bc7ecc12f0a99dbd83) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Fixed `unflatten()` destroying JSON objects with numeric keys. `{ '6': …, '10': …, default: … }` was rebuilt as an array (the first numeric segment decided the container type), and the remaining non-numeric keys landed in `arr[NaN]` — properties `JSON.stringify()` drops, so the values were lost on save. The container type is now decided per path over all of its children: an array only when every sibling segment is an index.

## 0.3.4

### Patch Changes

- [`596ad7d`](https://github.com/modern-admin/modern-admin/commit/596ad7dd27ec3da2538afcbeb342cac1e707c8e5) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Fixed sidebar animations performance and resource actions config

## 0.3.3

### Patch Changes

- [`e92a998`](https://github.com/modern-admin/modern-admin/commit/e92a9983cdd14125ebb4dd0cd9f8062216d18a5c) Thanks [@SergiyIva](https://github.com/SergiyIva)! - column order fix

## 0.3.2

### Patch Changes

- [`cdc8639`](https://github.com/modern-admin/modern-admin/commit/cdc86393f211e8d10b856d9091baa910a11e739f) Thanks [@SergiyIva](https://github.com/SergiyIva)! - enhanced chart builder functionality

## 0.3.0

### Minor Changes

- [`69606d4`](https://github.com/modern-admin/modern-admin/commit/69606d4c2e2ee6204dde978fa59e4454e3ca7ac2) Thanks [@SergiyIva](https://github.com/SergiyIva)! - History revisions now support retention and redact secrets by default.

  - `IHistoryStore` gains an optional `prune(retention)` method and a new
    `HistoryRetention` type (`keepLast`, `keepDays`). `MemoryHistoryStore`
    takes a retention policy in its constructor and self-trims on append
    (per-record ring buffer + age cutoff), so the default in-memory store no
    longer grows unbounded — it previously kept two full snapshots per
    revision forever.
  - `historyFeature` / `historyPlugin` accept `keepLast` and `keepDays`,
    passed to the default store and enforced after every append on any store
    that implements `prune`.
  - The in-memory fallback now logs a one-time warning outside tests when no
    persistent store is configured.
  - Snapshots exclude secrets by default: `password`-typed properties and
    statically inaccessible properties (`isAccessible: false`) are stripped
    from `snapshot` / `snapshotBefore`. Opt back in with `includeSecrets: true`.

- [`69606d4`](https://github.com/modern-admin/modern-admin/commit/69606d4c2e2ee6204dde978fa59e4454e3ca7ac2) Thanks [@SergiyIva](https://github.com/SergiyIva)! - harden search fallback scan, avoid payload mutation in json-by-key, paginate cache invalidateTags, and make history writes fire-and-forget

### Patch Changes

- [`69606d4`](https://github.com/modern-admin/modern-admin/commit/69606d4c2e2ee6204dde978fa59e4454e3ca7ac2) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Deduplicate adapter and system-store internals into shared `@modern-admin/core`
  helpers. The Prisma and Drizzle adapters no longer keep byte-identical copies of
  the filter-value coercion (`coerceScalar`, `isRangeValue`, `between` parsing) or
  the time-series utilities (`isoDate`, `toNumber`, `stringifyKey`, `toDate`,
  `sumValues`, `buildDisplaySql`, row cap) — these now live in
  `core/src/adapters/filter-coerce.ts` and `core/src/adapters/time-series.ts`.
  Likewise the six ORM-backed system stores share one set of row → domain mappers
  in `core/src/system/row-mappers.ts` instead of maintaining duplicates in
  `system-prisma` and `system-drizzle`. Behaviour is unchanged; adapter-specific
  pieces (Prisma `where` objects, Drizzle SQL builders, top-N/`__other__`
  bucketing, the config scope-id sentinel) stay in their adapters.

## 0.2.1

### Patch Changes

- [`68ee72e`](https://github.com/modern-admin/modern-admin/commit/68ee72e721babf28158274b6fe98e3af8148cf92) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Republish with correct internal dependency ranges. 0.2.0 was published with internal `@modern-admin/*` dependencies pinned to the stale exact version `0.1.1` (bun substitutes `workspace:` ranges from a bun.lock that `changeset version` had not refreshed), which broke consumers with nested-copy resolution errors (`Export named 'recordsTag' not found`). Internal ranges are now published as `^<version>` (`workspace:^`), the release pipeline syncs bun.lock workspace versions after versioning, and publishing aborts if a packed tarball carries a wrong internal range.

## 0.2.0

### Minor Changes

- [`64f17a6`](https://github.com/modern-admin/modern-admin/commit/64f17a63626ab2990aee38fb035469aed8992e99) Thanks [@SergiyIva](https://github.com/SergiyIva)! - cache layer, realtime updates and bundle enhanced

## 0.1.1

### Patch Changes

- [`c151019`](https://github.com/modern-admin/modern-admin/commit/c151019f159f41c1574ae6993f582bfd21987983) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Add npm package metadata: a per-package README (install + links back to the Modern Admin repo) plus `homepage` and `keywords` fields for better discoverability on npm.
