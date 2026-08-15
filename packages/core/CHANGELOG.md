# @modern-admin/core

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
