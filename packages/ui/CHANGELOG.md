# @modern-admin/ui

## 0.9.0

### Patch Changes

- [#39](https://github.com/modern-admin/modern-admin/pull/39) [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Cap `DialogContent` height at the viewport (`max-h-[calc(100dvh-2rem)]`) and
  scroll overflow instead of clipping it. Tall modals (e.g. the media generation
  form) previously rendered content below the fold with no way to reach it. The
  close button is pinned above the scrolled content, and call-sites can still
  override `max-h`/`overflow`/padding via `className` (command palette, chart
  builder).

- [#39](https://github.com/modern-admin/modern-admin/pull/39) [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Fix the `MediaPreview` URL text overflowing its container on the show page. The
  URL now renders on its own line under the "Preview" button, fills the available
  width, and truncates in the **middle** (`http://…/thumb.png`) so both the origin
  and the file name stay visible — instead of spilling past narrow columns or
  clipping only the (most useful) tail. The full URL remains in a `title` tooltip.

- [#39](https://github.com/modern-admin/modern-admin/pull/39) [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Stop the `Select` dropdown from reserving a permanent 24px slot above the first
  and below the last option. The scroll chevrons are now absolutely positioned
  overlays that Radix only mounts while the list can scroll, so short lists no
  longer render large empty gaps and the list still doesn't jump when the buttons
  appear/disappear mid-scroll.

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

- [`4251f7a`](https://github.com/modern-admin/modern-admin/commit/4251f7a6ea01ad80fbd5515a27cec2e138d2ccb5) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Added localized text search for resources on the admin home page and hid the
  native search reset control when an Input provides its own clear button. Select
  menus now retain their height after the down-scroll indicator disappears.
  JSON properties in the show view now offer a copy button.

## 0.4.2

### Patch Changes

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

## 0.2.0

### Minor Changes

- [`64f17a6`](https://github.com/modern-admin/modern-admin/commit/64f17a63626ab2990aee38fb035469aed8992e99) Thanks [@SergiyIva](https://github.com/SergiyIva)! - cache layer, realtime updates and bundle enhanced

## 0.1.1

### Patch Changes

- [`c151019`](https://github.com/modern-admin/modern-admin/commit/c151019f159f41c1574ae6993f582bfd21987983) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Add npm package metadata: a per-package README (install + links back to the Modern Admin repo) plus `homepage` and `keywords` fields for better discoverability on npm.
