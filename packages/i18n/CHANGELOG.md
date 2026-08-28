# @modern-admin/i18n

## 0.9.0

### Minor Changes

- [#30](https://github.com/modern-admin/modern-admin/pull/30) [`69f6c5d`](https://github.com/modern-admin/modern-admin/commit/69f6c5d5c8850c1b6bcf314284127d97a9975126) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Add API Stock as the built-in AI assistant provider and expose a provider-specific API key signup link in assistant settings.

- [#30](https://github.com/modern-admin/modern-admin/pull/30) [`69f6c5d`](https://github.com/modern-admin/modern-admin/commit/69f6c5d5c8850c1b6bcf314284127d97a9975126) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Add webhook-driven API Stock image and video generation, dynamic model forms, private task updates, explicit paid-request confirmation, upload-backed record application, product-card actions, and AI assistant media drafts.

### Patch Changes

- [#33](https://github.com/modern-admin/modern-admin/pull/33) [`42d36b0`](https://github.com/modern-admin/modern-admin/commit/42d36b09166f23ad8ac644c4aead2341c13f25b2) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Gate creation UI by the server-advertised `new` action and show a forbidden state for direct creation URLs when the action is unavailable.
  
  Add creation-specific property visibility and ordering through `isVisible.new` and `newProperties`, with backwards-compatible fallback to the edit view, and replace empty creation/edit forms with a localized empty state without a submit action.

- [#30](https://github.com/modern-admin/modern-admin/pull/30) [`69f6c5d`](https://github.com/modern-admin/modern-admin/commit/69f6c5d5c8850c1b6bcf314284127d97a9975126) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Hint the separator for array parameters in the media generation form. Fields
  that accept multiple values (e.g. reference image URLs) now show "Separate
  values with a comma or a new line." below the description, matching how the
  input is parsed. Translated in all locales.

- [#30](https://github.com/modern-admin/modern-admin/pull/30) [`69f6c5d`](https://github.com/modern-admin/modern-admin/commit/69f6c5d5c8850c1b6bcf314284127d97a9975126) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Replace the native `<select>` elements in the media generation form (model +
  enum params) with the Radix `Select` dropdown so they match the rest of the
  kit and the chevron sits inside the trigger padding instead of jamming against
  the edge. Adds a `common:none` string for an optional param's "unset" choice
  (Radix forbids an empty-string item value, so it rides a sentinel).

## 0.8.0

### Patch Changes

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

### Patch Changes

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

- [`4251f7a`](https://github.com/modern-admin/modern-admin/commit/4251f7a6ea01ad80fbd5515a27cec2e138d2ccb5) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Added localized text search for resources on the admin home page and hid the
  native search reset control when an Input provides its own clear button. Select
  menus now retain their height after the down-scroll indicator disappears.
  JSON properties in the show view now offer a copy button.

## 0.4.2

### Patch Changes

- [`21f3457`](https://github.com/modern-admin/modern-admin/commit/21f3457c8260279be5055bc1f7a76be3ea5fee46) Thanks [@SergiyIva](https://github.com/SergiyIva)! - modal action title

- [`21f3457`](https://github.com/modern-admin/modern-admin/commit/21f3457c8260279be5055bc1f7a76be3ea5fee46) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Confirm dialogs no longer default to the delete wording. A guarded custom action now shows a neutral "Confirm action" title with a "Confirm" button; only destructive confirms keep "Delete this record?" / "Delete". Adds `common:confirmAction` and `common:confirm` to every locale.

## 0.3.4

### Patch Changes

- [`596ad7d`](https://github.com/modern-admin/modern-admin/commit/596ad7dd27ec3da2538afcbeb342cac1e707c8e5) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Fixed sidebar animations performance and resource actions config

## 0.3.2

### Patch Changes

- [`cdc8639`](https://github.com/modern-admin/modern-admin/commit/cdc86393f211e8d10b856d9091baa910a11e739f) Thanks [@SergiyIva](https://github.com/SergiyIva)! - enhanced chart builder functionality

## 0.3.0

### Minor Changes

- [`69606d4`](https://github.com/modern-admin/modern-admin/commit/69606d4c2e2ee6204dde978fa59e4454e3ca7ac2) Thanks [@SergiyIva](https://github.com/SergiyIva)! - harden search fallback scan, avoid payload mutation in json-by-key, paginate cache invalidateTags, and make history writes fire-and-forget

## 0.2.1

### Patch Changes

- [`68ee72e`](https://github.com/modern-admin/modern-admin/commit/68ee72e721babf28158274b6fe98e3af8148cf92) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Republish with correct internal dependency ranges. 0.2.0 was published with internal `@modern-admin/*` dependencies pinned to the stale exact version `0.1.1` (bun substitutes `workspace:` ranges from a bun.lock that `changeset version` had not refreshed), which broke consumers with nested-copy resolution errors (`Export named 'recordsTag' not found`). Internal ranges are now published as `^<version>` (`workspace:^`), the release pipeline syncs bun.lock workspace versions after versioning, and publishing aborts if a packed tarball carries a wrong internal range.

## 0.1.1

### Patch Changes

- [`c151019`](https://github.com/modern-admin/modern-admin/commit/c151019f159f41c1574ae6993f582bfd21987983) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Add npm package metadata: a per-package README (install + links back to the Modern Admin repo) plus `homepage` and `keywords` fields for better discoverability on npm.
