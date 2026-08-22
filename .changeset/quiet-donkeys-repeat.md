---
"@modern-admin/adapter-prisma": minor
"@modern-admin/auth-better-auth": minor
"@modern-admin/core": minor
"@modern-admin/i18n": minor
"@modern-admin/nest": minor
"@modern-admin/react": minor
"@modern-admin/system-prisma": minor
"@modern-admin/ui": minor
"@modern-admin/web": minor
---

Implement the 22 findings from the v0.5.0 audit: supported whitelabeling and UI-string
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
