# @modern-admin/adapter-drizzle

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
