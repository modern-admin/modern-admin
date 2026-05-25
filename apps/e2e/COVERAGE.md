# E2e test coverage — gaps and roadmap

Snapshot of what the Playwright suite covers vs. what's still missing, with
a prioritised work plan. Update this file when a row moves from gap → done.

## Current coverage

### API project (`projects: ['api']`)
- `api.spec.ts` — REST CRUD on customers, config, list pagination, FK exposure
- `caching-api.spec.ts` — `x-cache` MISS→HIT cycle, mutation invalidation, split-tag (edit A leaves B's `show` cache intact), concurrent dedup
- `custom-actions-api.spec.ts` — `@Action` (record / bulk / resource) on posts + products
- `date-filter-api.spec.ts` — date-range operators (`~~from/~~to`, `between`, `gt/lt`)
- `forms-api.spec.ts` — form-data writes: scalar, enum, date, reference FK, json, richtext, composite FK, `@Before` hooks
- `global-search-api.spec.ts` — global search grouping, limits, validation
- `graphql.spec.ts` + `graphql-mutations.spec.ts` — schema, queries, mutations, DataLoader
- `history-api.spec.ts` — record revisions list / fetch / revert (API only)
- `openapi.spec.ts` — OpenAPI doc + Swagger UI + CORS
- `timeseries-api.spec.ts` — chart time-series with FK `groupByLabelResource` label resolution; verifies `titleProperty` override is honoured over heuristic column detection

### Browser project (`projects: ['chromium']`)
- `bulk-actions-ui.spec.ts` — multi-row select + Actions dropdown → `publishMany`, Clear selection
- `draft-autosave.spec.ts` — localStorage draft persistence + Undo toast
- `edit-page.spec.ts` — hydration, PATCH on save, required-field validation
- `export-ui.spec.ts` — list-page Export dialog: CSV + JSON downloads, Close
- `feature-json-by-key-ui.spec.ts` — `feature-json-by-key`: virtual fields, `showWhen` swap, JSON merge round-trip
- `feature-password-ui.spec.ts` — `feature-password`: virtual `newPassword` input, hash rotation, no plaintext echo
- `filter-sidebar-ui.spec.ts` — FilterPanel side-sheet: reference filter (strict FK equality), enum filter (`availableValues` → Select), filter-count badge, clear-all restores unfiltered list + removes URL params
- `forms-ui.spec.ts` — custom color-picker, color-swatch show, boolean Switch, m2m combobox + chip-remove
- `forms-upload-ui.spec.ts` — single + multi-value file upload (products.thumbnail / .gallery), remove, show-page preview
- `global-search-ui.spec.ts` — command-palette dialog: trigger button + `mod+k` hotkey, search results grouped by resource, recent-searches persistence in localStorage, clear recent, keyboard navigation
- `history-ui.spec.ts` — Revisions Sheet, timeline, Revert confirm + cancel
- `i18n-ui.spec.ts` — language switcher (configured subset only), en↔ru round-trip, chrome/resource/action/property label translations, locale persisted in localStorage across reload
- `list-crud.spec.ts` — pagination, filter URL, cell-click → edit, row actions, delete
- `list-page-advanced.spec.ts` — sort cycle, per-page selector, column visibility
- `list-page-layout.spec.ts` — mobile + desktop layout regression
- `m2m-picker-dialog.spec.ts` — m2m table-dialog picker (posts/tags)
- `not-found.spec.ts` — 404 cases for show/edit/router
- `numeric-filter.spec.ts` — numeric filter operators (`between`, `gt`, `eq`) on `Float?` column; verifies operator prefix is stripped before adapter receives typed scalar
- `references-and-state.spec.ts` — reference rendering + URL deep-link state
- `related-records-ui.spec.ts` — RelatedRecordsTabs on customers show, tab switch, embedded pagination
- `settings.spec.ts` — settings page navigation (API keys / webhooks sections)
- `show-page.spec.ts` — show field rendering, header buttons, delete
- `social-login-ui.spec.ts` — ui-props endpoint shape, login page without/with social providers (route-mocked), separator visibility, emailAndPassword:false hides form, unknown provider fallback, POST body on click, disabled state during redirect
- `visual-regression.spec.ts` — screenshot baselines (home, customers list, customers/new, settings) at fixed 1280×800; `toHaveScreenshot()` with `maxDiffPixelRatio: 0.02`
- `web.spec.ts` — SPA smoke (home + resource list)
- `wizard-create.spec.ts` — three-step wizard create flow

## 🔴 Critical gaps — feature plugins shipped but un-tested e2e

| Plugin | Missing coverage | UI surface |
|---|---|---|
| ~~`feature-upload`~~ | ✅ covered by `forms-upload-ui.spec.ts` | — |
| ~~`feature-history` (UI)~~ | ✅ covered by `history-ui.spec.ts` | — |
| ~~`feature-password`~~ | ✅ covered by `feature-password-ui.spec.ts` | — |
| ~~`feature-json-by-key`~~ | ✅ covered by `feature-json-by-key-ui.spec.ts` | — |

Pro feature plugins (`@modern-admin-pro/feature-ai-fill`, `feature-logging`,
`feature-webhooks`) are covered by Playwright specs in the separate Pro
monorepo (`modern-admin-pro/apps/e2e/`) — not exercised here.

## 🟠 Important — core UI flows without coverage

| Area | What to test |
|---|---|
| ~~CSV / JSON export~~ | ✅ covered by `export-ui.spec.ts` |
| ~~Bulk actions UI~~ | ✅ covered by `bulk-actions-ui.spec.ts` |
| ~~Related records tabs~~ | ✅ covered by `related-records-ui.spec.ts` |
| AI Assistant | floating "AI" button → chat, send prompt with mocked model, see reply |
| Dashboard | Add chart / Add group / configure / drag-drop reorder |
| Settings → API keys | create key, copy, use in `Authorization: Bearer`, revoke |
| Auth flows | logout, 401 redirect, session expiry, change password |
| Permissions / RBAC | roles resource, `isAccessible` action gates |
| Notifications / Toasts | assert toasts on success / error paths |
| Confirm dialogs | custom (non-delete) confirm scenarios |
| Keyboard shortcuts | `Ctrl+E` on show-page → edit, and other hotkeys |

## 🟡 Desirable — cross-cutting

| Item | Why |
|---|---|
| ~~Run UI tests against `api-prisma`~~ | ✅ done — the entire suite now drives `apps/api-prisma` (Prisma 7 + Postgres). The legacy `apps/api` (in-memory adapter) has been removed |
| Run UI tests against `api-drizzle` | Same logic — drizzle backend lives, no UI ever drives it |
| WebSocket realtime | open two tabs, mutate in one → second tab updates live (`packages/realtime`) |
| Cache invalidation via Redis pub/sub | 2 API processes, mutation in one → cache invalidates in the other |
| ~~i18n runtime language switch~~ | ✅ covered by `i18n-ui.spec.ts` (en↔ru, localStorage persistence) |
| Theme toggle | dark / light switch |
| Mobile sidebar drawer | interactive open / close on narrow viewport |

## 🟢 Low-priority / nice-to-have

- Error boundary behaviour (backend 500 / router crash)
- Custom (non-wizard) custom forms
- Field-level visibility (`visibility: { list: false, ... }`)
- Property `position` / ordering in forms
- Show-page keyboard navigation / focus management
- Queue / Cron e2e (only unit-tested today)

## 📦 Recommended execution order

Cheapest-first, highest-impact-first:

1. ~~**`forms-upload-ui.spec.ts`**~~ ✅ done — upload + remove + multi-gallery + show-page preview
2. ~~**`history-ui.spec.ts`**~~ ✅ done — Revisions Sheet, Revert confirm + cancel
3. ~~**`export-ui.spec.ts`**~~ ✅ done — CSV + JSON downloads on customers
4. ~~**`bulk-actions-ui.spec.ts`**~~ ✅ done — `publishMany` via UI, Clear selection
5. ~~**`related-records-ui.spec.ts`**~~ ✅ done — Posts/Comments tabs, switch, paginate
6. **`settings-api-keys.spec.ts`** — create API key, use in `Authorization:
   Bearer`, revoke
7. **`ai-assistant.spec.ts`** — open chat, send prompt against mocked model,
   verify reply

## Conventions

- Fixtures must be created and torn down per-test via the REST API — don't
  drift the seeded counts other specs assert on.
- Find fixture rows by unique name, never by positional pagination
  (orphan accumulation in the Prisma DB shifts pages off the expected rows).
- Save ad-hoc screenshots into `apps/e2e/playwright/.artifacts/` (git-ignored).
- Prefix CLI runs with `PLAYWRIGHT_CHANNEL=chrome` on systems without
  Playwright's bundled chromium binaries.
