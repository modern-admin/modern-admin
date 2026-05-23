# E2e test coverage — gaps and roadmap

Snapshot of what the Playwright suite covers vs. what's still missing, with
a prioritised work plan. Update this file when a row moves from gap → done.

## Current coverage

### API project (`projects: ['api']`)
- `api.spec.ts` — REST CRUD on customers, config, list pagination, FK exposure
- `audit-log-api.spec.ts` — audit log endpoints, filters, limits
- `custom-actions-api.spec.ts` — `@Action` (record / bulk / resource) on posts + products
- `date-filter-api.spec.ts` — date-range operators (`~~from/~~to`, `between`, `gt/lt`)
- `forms-api.spec.ts` — form-data writes: scalar, enum, date, reference FK, json, richtext, composite FK, `@Before` hooks
- `global-search-api.spec.ts` — global search grouping, limits, validation
- `graphql.spec.ts` + `graphql-mutations.spec.ts` — schema, queries, mutations, DataLoader
- `history-api.spec.ts` — record revisions list / fetch / revert (API only)
- `numeric-filter.spec.ts` — numeric operators
- `openapi.spec.ts` — OpenAPI doc + Swagger UI + CORS

### Browser project (`projects: ['chromium']`)
- `ai-fill-ui.spec.ts` — `feature-ai-fill`: button visibility, mocked recognize → field hydration, cancel
- `bulk-actions-ui.spec.ts` — multi-row select + Actions dropdown → `publishMany`, Clear selection
- `feature-json-by-key-ui.spec.ts` — `feature-json-by-key`: virtual fields, `showWhen` swap, JSON merge round-trip
- `feature-logging-ui.spec.ts` — audit-log page: filters (resource / action / record id), entry cards
- `feature-password-ui.spec.ts` — `feature-password`: virtual `newPassword` input, hash rotation, no plaintext echo
- `feature-webhooks-ui.spec.ts` — `/settings/webhooks`: create, test dispatch, edit, delete confirm dialog
- `draft-autosave.spec.ts` — localStorage draft persistence + Undo toast
- `edit-page.spec.ts` — hydration, PATCH on save, required-field validation
- `export-ui.spec.ts` — list-page Export dialog: CSV + JSON downloads, Close
- `forms-ui.spec.ts` — custom color-picker, color-swatch show, boolean Switch, m2m combobox + chip-remove
- `forms-upload-ui.spec.ts` — single + multi-value file upload (products.thumbnail / .gallery), remove, show-page preview
- `history-ui.spec.ts` — Revisions Sheet, timeline, Revert confirm + cancel
- `list-crud.spec.ts` — pagination, filter URL, cell-click → edit, row actions, delete
- `list-page-advanced.spec.ts` — sort cycle, per-page selector, column visibility
- `list-page-layout.spec.ts` — mobile + desktop layout regression
- `m2m-picker-dialog.spec.ts` — m2m table-dialog picker (posts/tags)
- `not-found.spec.ts` — 404 cases for show/edit/router
- `references-and-state.spec.ts` — reference rendering + URL deep-link state
- `related-records-ui.spec.ts` — RelatedRecordsTabs on customers show, tab switch, embedded pagination
- `settings.spec.ts` — settings page navigation (API keys / webhooks sections)
- `show-page.spec.ts` — show field rendering, header buttons, delete
- `web.spec.ts` — SPA smoke (home + resource list)
- `wizard-create.spec.ts` — three-step wizard create flow

## 🔴 Critical gaps — feature plugins shipped but un-tested e2e

| Plugin | Missing coverage | UI surface |
|---|---|---|
| ~~`feature-upload`~~ | ✅ covered by `forms-upload-ui.spec.ts` | — |
| ~~`feature-history` (UI)~~ | ✅ covered by `history-ui.spec.ts` | — |
| ~~`feature-ai-fill`~~ | ✅ covered by `ai-fill-ui.spec.ts` | — |
| ~~`feature-password`~~ | ✅ covered by `feature-password-ui.spec.ts` | — |
| ~~`feature-webhooks`~~ | ✅ covered by `feature-webhooks-ui.spec.ts` | — |
| ~~`feature-logging`~~ | ✅ covered by `feature-logging-ui.spec.ts` | — |
| ~~`feature-json-by-key`~~ | ✅ covered by `feature-json-by-key-ui.spec.ts` | — |

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
| Run UI tests against `api-prisma` | Today all UI tests hit in-memory `apps/api`. Real adapter bugs (PrismaClientValidationError, form-coercion) would have been caught earlier with UI runs against Prisma |
| Run UI tests against `api-drizzle` | Same logic — drizzle backend lives, no UI ever drives it |
| WebSocket realtime | open two tabs, mutate in one → second tab updates live (`packages/realtime`) |
| Cache invalidation via Redis pub/sub | 2 API processes, mutation in one → cache invalidates in the other |
| i18n runtime language switch | toggle locale → strings actually change (smoke across 9 locales) |
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
7. **`forms-ui-prisma.spec.ts`** — re-run `forms-ui` matrix-style against
   `api-prisma`
8. **`ai-assistant.spec.ts`** — open chat, send prompt against mocked model,
   verify reply

## Conventions

- Fixtures must be created and torn down per-test via the REST API — don't
  drift the seeded counts other specs assert on.
- Find fixture rows by unique name, never by positional pagination
  (orphan accumulation in the Prisma DB shifts pages off the expected rows).
- Save ad-hoc screenshots into `apps/e2e/playwright/.artifacts/` (git-ignored).
- Prefix CLI runs with `PLAYWRIGHT_CHANNEL=chrome` on systems without
  Playwright's bundled chromium binaries.
