# @modern-admin/adapter-prisma

## 0.4.2

### Patch Changes

- [`3ad467e`](https://github.com/modern-admin/modern-admin/commit/3ad467edaf7f219843d5468f39ceb1a9a09b0383) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Added user friendly chart's filters and selector component adoptation for mobile view

- [`3ad467e`](https://github.com/modern-admin/modern-admin/commit/3ad467edaf7f219843d5468f39ceb1a9a09b0383) Thanks [@SergiyIva](https://github.com/SergiyIva)! - fix: map Prisma 7 driver-adapter constraint errors to 400 instead of 500

  `toValidationError` only understood the legacy Rust engine's `meta.target`
  (P2002) and `meta.field_name` (P2003). With a driver adapter (`@prisma/adapter-pg`
  and friends) Prisma 7 reports constraints under
  `meta.driverAdapterError.cause.constraint` instead, so both branches missed and
  every unique/foreign-key conflict surfaced as an internal server error. All
  three constraint shapes (`{ fields }`, `{ index }`, `{ foreignKey }`) are now
  resolved to Prisma field names — honouring `@map` and composite indexes — with a
  record-level 400 when the constraint carries no usable detail.

  `delete()` also no longer bypasses the mapper: delete-restrict raises P2003 and
  now yields a 400 explaining the record is still referenced, rather than a 500.

## 0.4.1

### Patch Changes

- [`d39e559`](https://github.com/modern-admin/modern-admin/commit/d39e559e5e1cdf9fdbba9cd53f3cdf386af6baee) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Build the filter panel from the filter view instead of the list columns.

  `ResourceListPage` fed `FilterControl` the same property set it fed the table,
  so everything the server computed for the `filter` view was discarded by the
  SPA. `filterProperties` and `isVisible: { filter: … }` read as working config —
  documented, typed, Zod-validated, merged with replace semantics — while having
  no effect at all, and a property hidden from the table was silently
  unfilterable. The panel (and the per-column header filters) now render
  `propertyOrder.filter`, which the API has been serialising all along.

  Two consequences of the old behaviour are fixed with it:

  - **Filtering by id works when you ask for it.** The filter view drops id
    columns by default; listing one in `filterProperties` (or setting
    `isVisible: { filter: true }`) now actually surfaces it, so a record can be
    looked up by an id pasted from a log or a support ticket.
  - **A field excluded from filtering can no longer reach the adapter.** Virtual
    properties marked `isVisible: { filter: false }` used to stay in the panel and
    emit a `where` clause against a column that doesn't exist.

  Two adjacent defects surfaced while verifying the above, both of which made the
  id filter useless even once it rendered:

  - Adapters return no distinct values for non-string columns, and the string
    filter field read an _empty_ distinct list as "low cardinality" — switching to
    a checkbox picker with nothing to check, so the value could not be typed.
  - `@modern-admin/adapter-prisma` gated `contains`/`startsWith`/`endsWith` on the
    core property _type_, so on a `String @id` (surfaced as `uuid`) the clause was
    dropped and the unfiltered list came back. The gate now asks the underlying
    DMMF field. `eq`/`neq` deliberately stay exact on those columns — the
    case-insensitive branch costs the btree index, and id/FK equality is the hot
    path.

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
