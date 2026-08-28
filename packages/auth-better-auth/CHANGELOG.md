# @modern-admin/auth-better-auth

## 0.9.0

### Patch Changes

- Updated dependencies [[`69f6c5d`](https://github.com/modern-admin/modern-admin/commit/69f6c5d5c8850c1b6bcf314284127d97a9975126), [`42d36b0`](https://github.com/modern-admin/modern-admin/commit/42d36b09166f23ad8ac644c4aead2341c13f25b2), [`69f6c5d`](https://github.com/modern-admin/modern-admin/commit/69f6c5d5c8850c1b6bcf314284127d97a9975126)]:
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
