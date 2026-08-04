# @modern-admin/react

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
