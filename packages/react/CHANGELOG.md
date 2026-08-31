# @modern-admin/react

## 0.10.0

### Minor Changes

- [#44](https://github.com/modern-admin/modern-admin/pull/44) [`86b07c4`](https://github.com/modern-admin/modern-admin/commit/86b07c45dc99542f0377d86847c3b9636666e16a) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Add full operator controls to dashboard chart filters, including negated and empty reference filters and empty/non-empty date filters. Keep Drizzle null checks type-safe for non-string columns.

- [#44](https://github.com/modern-admin/modern-admin/pull/44) [`86b07c4`](https://github.com/modern-admin/modern-admin/commit/86b07c45dc99542f0377d86847c3b9636666e16a) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Add collision-free structured filter criteria across core, REST, React, dashboards, and GraphQL. New clients keep operators separate from user values, while core continues to read legacy operator-prefixed strings. Structured numeric and date ranges are translated consistently by both ORM adapters. Prisma empty/non-empty filters now respect database nullability, including required references. GraphQL replaces the legacy `filter` argument with a typed `where` argument. Remove the unused server-branding `logo` and `theme` options.

### Patch Changes

- [#42](https://github.com/modern-admin/modern-admin/pull/42) [`d7ba345`](https://github.com/modern-admin/modern-admin/commit/d7ba3455830e56f86409c912609e22014e04f802) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Move the toolchain to TypeScript 7 and replace ESLint with oxlint + Prettier.
  Dropping `typescript-eslint` (whose peer pinned `typescript <6.1`) unblocked the
  TypeScript 7 native compiler, which now handles both typecheck and build emit.
  This is a build-time change only — no runtime or public API changes; packages
  are rebuilt with the TS 7 compiler.

- [#43](https://github.com/modern-admin/modern-admin/pull/43) [`7e04782`](https://github.com/modern-admin/modern-admin/commit/7e047823c592fde503da83319815820a89c92967) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Keep refresh and resource-scoped custom actions available in the resource list toolbar when the
  resource has no records.

- [#40](https://github.com/modern-admin/modern-admin/pull/40) [`cd7e365`](https://github.com/modern-admin/modern-admin/commit/cd7e3659dd1a9c08438edbce726694e4244db32c) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Refresh the monorepo to the latest stable dependency lines. Headline: NestJS
  11 -> 12 across every transport package (`nest`, `graphql`, `queue`,
  `realtime`, `feature-upload`) — including `@nestjs/swagger` 12 and
  `@nestjs/bullmq` 12 — which raises the `@nestjs/*` peer range to `^12`, so
  consumers must move to NestJS 12 as well. Also on bun 1.4 (`@types/bun` 1.4).
  
  Other lines bumped to current stable: Prisma 7.10, BullMQ 6.3, better-auth
  1.7.2, Zod 4.5, jose 6.2, TanStack Query/Router/Table, lucide-react 1.37,
  react-hook-form 7.86, TipTap 3.30.5, Vite 8.2.2, and the AI SDK (`ai` 7.0.84).
  Prisma stays on the 7.x stable line (8.0 is still a release candidate).
- Updated dependencies [[`86b07c4`](https://github.com/modern-admin/modern-admin/commit/86b07c45dc99542f0377d86847c3b9636666e16a), [`d7ba345`](https://github.com/modern-admin/modern-admin/commit/d7ba3455830e56f86409c912609e22014e04f802), [`cd7e365`](https://github.com/modern-admin/modern-admin/commit/cd7e3659dd1a9c08438edbce726694e4244db32c), [`86b07c4`](https://github.com/modern-admin/modern-admin/commit/86b07c45dc99542f0377d86847c3b9636666e16a)]:
  - @modern-admin/core@0.10.0
  - @modern-admin/i18n@0.10.0
  - @modern-admin/ui@0.10.0

## 0.9.0

### Minor Changes

- [#39](https://github.com/modern-admin/modern-admin/pull/39) [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Add API Stock as the built-in AI assistant provider and expose a provider-specific API key signup link in assistant settings.

- [#39](https://github.com/modern-admin/modern-admin/pull/39) [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Add webhook-driven API Stock image and video generation, dynamic model forms, private task updates, explicit paid-request confirmation, upload-backed record application, product-card actions, and AI assistant media drafts.

- [#39](https://github.com/modern-admin/modern-admin/pull/39) [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Gate creation UI by the server-advertised `new` action and show a forbidden state for direct creation URLs when the action is unavailable.
  
  Add creation-specific property visibility and ordering through `isVisible.new` and `newProperties`, with backwards-compatible fallback to the edit view, and replace empty creation/edit forms with a localized empty state without a submit action.

- [#39](https://github.com/modern-admin/modern-admin/pull/39) [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Remove the standalone Media Generation section from the admin Settings hub. The
  media generation provider key is configured via the `API_STOCK_KEY` environment
  variable (shared with the AI assistant); the in-record generation studio is
  unaffected.

### Patch Changes

- [#39](https://github.com/modern-admin/modern-admin/pull/39) [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Hint the separator for array parameters in the media generation form. Fields
  that accept multiple values (e.g. reference image URLs) now show "Separate
  values with a comma or a new line." below the description, matching how the
  input is parsed. Translated in all locales.

- [#39](https://github.com/modern-admin/modern-admin/pull/39) [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Show a human-readable message when media generation fails. The form now runs
  server error bodies through `parseApiError` instead of surfacing the raw JSON
  response (e.g. a `412` body was shown verbatim in the toast).

- [#39](https://github.com/modern-admin/modern-admin/pull/39) [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Replace the native `<select>` elements in the media generation form (model +
  enum params) with the Radix `Select` dropdown so they match the rest of the
  kit and the chevron sits inside the trigger padding instead of jamming against
  the edge. Adds a `common:none` string for an optional param's "unset" choice
  (Radix forbids an empty-string item value, so it rides a sentinel).
- Updated dependencies [[`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db), [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db), [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db), [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db), [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db), [`e6d85ae`](https://github.com/modern-admin/modern-admin/commit/e6d85ae69aa955b56f385fa20b451cb3766d3c29), [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db), [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db), [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db), [`eb83e7a`](https://github.com/modern-admin/modern-admin/commit/eb83e7a9544faef49416d4510a8d21ed6ea6b565), [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db)]:
  - @modern-admin/i18n@0.9.0
  - @modern-admin/core@0.9.0
  - @modern-admin/ui@0.9.0

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
  - @modern-admin/ui@0.7.0

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
  - @modern-admin/ui@0.6.0

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

- [`4251f7a`](https://github.com/modern-admin/modern-admin/commit/4251f7a6ea01ad80fbd5515a27cec2e138d2ccb5) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Added localized text search for resources on the admin home page and hid the
  native search reset control when an Input provides its own clear button. Select
  menus now retain their height after the down-scroll indicator disappears.
  JSON properties in the show view now offer a copy button.
- Updated dependencies [[`4251f7a`](https://github.com/modern-admin/modern-admin/commit/4251f7a6ea01ad80fbd5515a27cec2e138d2ccb5), [`4251f7a`](https://github.com/modern-admin/modern-admin/commit/4251f7a6ea01ad80fbd5515a27cec2e138d2ccb5), [`4251f7a`](https://github.com/modern-admin/modern-admin/commit/4251f7a6ea01ad80fbd5515a27cec2e138d2ccb5), [`4251f7a`](https://github.com/modern-admin/modern-admin/commit/4251f7a6ea01ad80fbd5515a27cec2e138d2ccb5)]:
  - @modern-admin/core@0.5.0
  - @modern-admin/i18n@0.5.0
  - @modern-admin/ui@0.5.0

## 0.4.2

### Patch Changes

- [`21f3457`](https://github.com/modern-admin/modern-admin/commit/21f3457c8260279be5055bc1f7a76be3ea5fee46) Thanks [@SergiyIva](https://github.com/SergiyIva)! - modal action title

- [`3ad467e`](https://github.com/modern-admin/modern-admin/commit/3ad467edaf7f219843d5468f39ceb1a9a09b0383) Thanks [@SergiyIva](https://github.com/SergiyIva)! - fix(ui): keep floating layers usable on mobile

  Floating content (Popover, Select, DropdownMenu incl. submenus, Tooltip) now
  portals into the enclosing Dialog / AlertDialog / Sheet instead of
  `document.body`. Radix wraps modal content in `react-remove-scroll`, which only
  lets touch gestures through inside that subtree — a dropdown portaled to the
  body rendered fine but could not be scrolled with a finger while the filter
  sheet was open.

  They also get a default `collisionPadding` that folds in the mobile browser's
  visual-viewport insets (URL bar, on-screen keyboard), so a layer that flips
  above its trigger no longer lands behind browser chrome, and they cap their
  height to the available viewport space — the reference combobox and the column
  filter popover now shrink their list instead of overflowing off-screen, keeping
  the search field visible.

- [`3ad467e`](https://github.com/modern-admin/modern-admin/commit/3ad467edaf7f219843d5468f39ceb1a9a09b0383) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Added user friendly chart's filters and selector component adoptation for mobile view

- [`21f3457`](https://github.com/modern-admin/modern-admin/commit/21f3457c8260279be5055bc1f7a76be3ea5fee46) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Confirm dialogs no longer default to the delete wording. A guarded custom action now shows a neutral "Confirm action" title with a "Confirm" button; only destructive confirms keep "Delete this record?" / "Delete". Adds `common:confirmAction` and `common:confirm` to every locale.

- Updated dependencies [[`21f3457`](https://github.com/modern-admin/modern-admin/commit/21f3457c8260279be5055bc1f7a76be3ea5fee46), [`3ad467e`](https://github.com/modern-admin/modern-admin/commit/3ad467edaf7f219843d5468f39ceb1a9a09b0383), [`3ad467e`](https://github.com/modern-admin/modern-admin/commit/3ad467edaf7f219843d5468f39ceb1a9a09b0383), [`21f3457`](https://github.com/modern-admin/modern-admin/commit/21f3457c8260279be5055bc1f7a76be3ea5fee46)]:
  - @modern-admin/i18n@0.4.2
  - @modern-admin/ui@0.4.2

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

- [`d39e559`](https://github.com/modern-admin/modern-admin/commit/d39e559e5e1cdf9fdbba9cd53f3cdf386af6baee) Thanks [@SergiyIva](https://github.com/SergiyIva)! - fixed timezone gap, filter list by default

- Updated dependencies [[`d39e559`](https://github.com/modern-admin/modern-admin/commit/d39e559e5e1cdf9fdbba9cd53f3cdf386af6baee), [`d39e559`](https://github.com/modern-admin/modern-admin/commit/d39e559e5e1cdf9fdbba9cd53f3cdf386af6baee)]:
  - @modern-admin/ui@0.4.1
  - @modern-admin/core@0.4.1

## 0.4.0

### Minor Changes

- [`48edd1d`](https://github.com/modern-admin/modern-admin/commit/48edd1da4dee37357d6c550f1e0a5df0e2e54cdc) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Fix styling and bundling for apps that build their own copy of the admin SPA.

  Three bugs made a custom SPA impossible to build against the published
  packages, forcing consumers to fork `@modern-admin/web` wholesale:

  - **Tailwind classes went missing.** `@modern-admin/ui/styles.css` scanned its
    sibling with `@source "../../react/src/**"`, a relative hop that only
    resolves when node_modules is hoisted. Under bun's isolated store (or pnpm)
    it matched zero files and every class used only by `@modern-admin/react` —
    the whole login page — was dropped from the bundle. Each package now scans
    itself, and apps import the new `@modern-admin/react/styles.css`, which
    composes `@modern-admin/ui/styles.css` on top. `@import` resolves package
    specifiers; `@source` never could.
  - **The published output was unimportable.** The shared React tsconfig used
    `jsx: "preserve"`, so `tsc` wrote `foo.jsx` to disk while rewriting import
    specifiers to `foo.js` — bundlers building against `dist/` failed with
    unresolved imports. Now `jsx: "react-jsx"`.
  - **No supported way to build a custom bundle.** `@modern-admin/web/vite` now
    exports `defineAdminAppConfig()` with the dev server, the
    `dist/standalone/` layout `ModernAdminStaticUiModule` expects, precompressed
    assets and prefetch hints. `packages/web` uses the same factory, so the two
    cannot drift.

  **Breaking:** `mount()` no longer imports the stylesheet — a second Tailwind
  root would compile the framework CSS twice and without the app's own
  `@source`. Apps calling `mount()` directly must now import
  `@modern-admin/react/styles.css` themselves, ideally from their own Tailwind
  root. The prebuilt standalone bundle is unaffected.

### Patch Changes

- Updated dependencies [[`48edd1d`](https://github.com/modern-admin/modern-admin/commit/48edd1da4dee37357d6c550f1e0a5df0e2e54cdc)]:
  - @modern-admin/ui@0.4.0

## 0.3.5

### Patch Changes

- Updated dependencies [[`fecfa57`](https://github.com/modern-admin/modern-admin/commit/fecfa57a818df221ed21c4bc7ecc12f0a99dbd83), [`fecfa57`](https://github.com/modern-admin/modern-admin/commit/fecfa57a818df221ed21c4bc7ecc12f0a99dbd83)]:
  - @modern-admin/core@0.3.5

## 0.3.4

### Patch Changes

- [`596ad7d`](https://github.com/modern-admin/modern-admin/commit/596ad7dd27ec3da2538afcbeb342cac1e707c8e5) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Fixed sidebar animations performance and resource actions config

- Updated dependencies [[`596ad7d`](https://github.com/modern-admin/modern-admin/commit/596ad7dd27ec3da2538afcbeb342cac1e707c8e5)]:
  - @modern-admin/core@0.3.4
  - @modern-admin/i18n@0.3.4
  - @modern-admin/ui@0.3.4

## 0.3.3

### Patch Changes

- [`e92a998`](https://github.com/modern-admin/modern-admin/commit/e92a9983cdd14125ebb4dd0cd9f8062216d18a5c) Thanks [@SergiyIva](https://github.com/SergiyIva)! - column order fix

- Updated dependencies [[`e92a998`](https://github.com/modern-admin/modern-admin/commit/e92a9983cdd14125ebb4dd0cd9f8062216d18a5c)]:
  - @modern-admin/core@0.3.3

## 0.3.2

### Patch Changes

- [`cdc8639`](https://github.com/modern-admin/modern-admin/commit/cdc86393f211e8d10b856d9091baa910a11e739f) Thanks [@SergiyIva](https://github.com/SergiyIva)! - enhanced chart builder functionality

- Updated dependencies [[`cdc8639`](https://github.com/modern-admin/modern-admin/commit/cdc86393f211e8d10b856d9091baa910a11e739f)]:
  - @modern-admin/core@0.3.2
  - @modern-admin/i18n@0.3.2
  - @modern-admin/ui@0.3.2

## 0.3.1

### Patch Changes

- [`545c473`](https://github.com/modern-admin/modern-admin/commit/545c4732c1c488e903017f218b80ed4a97a5a5e8) Thanks [@SergiyIva](https://github.com/SergiyIva)! - locale time ui shows

## 0.3.0

### Minor Changes

- [`69606d4`](https://github.com/modern-admin/modern-admin/commit/69606d4c2e2ee6204dde978fa59e4454e3ca7ac2) Thanks [@SergiyIva](https://github.com/SergiyIva)! - harden search fallback scan, avoid payload mutation in json-by-key, paginate cache invalidateTags, and make history writes fire-and-forget

### Patch Changes

- Updated dependencies [[`69606d4`](https://github.com/modern-admin/modern-admin/commit/69606d4c2e2ee6204dde978fa59e4454e3ca7ac2), [`69606d4`](https://github.com/modern-admin/modern-admin/commit/69606d4c2e2ee6204dde978fa59e4454e3ca7ac2), [`69606d4`](https://github.com/modern-admin/modern-admin/commit/69606d4c2e2ee6204dde978fa59e4454e3ca7ac2)]:
  - @modern-admin/core@0.3.0
  - @modern-admin/i18n@0.3.0
  - @modern-admin/ui@0.3.0

## 0.2.1

### Patch Changes

- [`68ee72e`](https://github.com/modern-admin/modern-admin/commit/68ee72e721babf28158274b6fe98e3af8148cf92) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Republish with correct internal dependency ranges. 0.2.0 was published with internal `@modern-admin/*` dependencies pinned to the stale exact version `0.1.1` (bun substitutes `workspace:` ranges from a bun.lock that `changeset version` had not refreshed), which broke consumers with nested-copy resolution errors (`Export named 'recordsTag' not found`). Internal ranges are now published as `^<version>` (`workspace:^`), the release pipeline syncs bun.lock workspace versions after versioning, and publishing aborts if a packed tarball carries a wrong internal range.

- [`68ee72e`](https://github.com/modern-admin/modern-admin/commit/68ee72e721babf28158274b6fe98e3af8148cf92) Thanks [@SergiyIva](https://github.com/SergiyIva)! - fixed changeset version upgrade of packages

- Updated dependencies [[`68ee72e`](https://github.com/modern-admin/modern-admin/commit/68ee72e721babf28158274b6fe98e3af8148cf92)]:
  - @modern-admin/core@0.2.1
  - @modern-admin/i18n@0.2.1
  - @modern-admin/ui@0.2.1

## 0.2.0

### Minor Changes

- [`64f17a6`](https://github.com/modern-admin/modern-admin/commit/64f17a63626ab2990aee38fb035469aed8992e99) Thanks [@SergiyIva](https://github.com/SergiyIva)! - cache layer, realtime updates and bundle enhanced

### Patch Changes

- Updated dependencies [[`64f17a6`](https://github.com/modern-admin/modern-admin/commit/64f17a63626ab2990aee38fb035469aed8992e99)]:
  - @modern-admin/core@0.2.0
  - @modern-admin/ui@0.2.0

## 0.1.1

### Patch Changes

- [`c151019`](https://github.com/modern-admin/modern-admin/commit/c151019f159f41c1574ae6993f582bfd21987983) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Add npm package metadata: a per-package README (install + links back to the Modern Admin repo) plus `homepage` and `keywords` fields for better discoverability on npm.

- Updated dependencies [[`c151019`](https://github.com/modern-admin/modern-admin/commit/c151019f159f41c1574ae6993f582bfd21987983)]:
  - @modern-admin/core@0.1.1
  - @modern-admin/i18n@0.1.1
  - @modern-admin/ui@0.1.1
