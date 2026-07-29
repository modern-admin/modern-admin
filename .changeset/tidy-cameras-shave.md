---
'@modern-admin/tsconfig': minor
'@modern-admin/react': minor
'@modern-admin/web': minor
'@modern-admin/ui': minor
---

Fix styling and bundling for apps that build their own copy of the admin SPA.

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
