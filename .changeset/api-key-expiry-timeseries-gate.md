---
'@modern-admin/auth-better-auth': patch
'@modern-admin/nest': patch
---

Fix API keys with an expiry, gate the time-series endpoint, and charge each
API-key request once against the key's rate limit.

- **`ApiKeysController` sent the expiry in milliseconds.** Better Auth's
  api-key plugin takes `expiresIn` in seconds, so every key with an expiry was
  rejected as `EXPIRES_IN_IS_TOO_LARGE` and surfaced as a 500. `expiresInDays`
  is now converted to seconds (`IApiKeyService` documents the unit), and a
  Better Auth 4xx rejection keeps its status and `code` instead of becoming a
  500 on create and update.
- **`POST /admin/api/timeseries` checked no permissions.** It aggregated any
  resource for any signed-in user, bypassing the role matrix and
  `isAccessible`. It now requires `canAccess(resource, 'list')` and read access
  to `dateField` / `field` / `groupBy` (403 otherwise), and resolves FK labels
  only from resources the caller may list.
- **Each API-key request consumed two rate-limit slots.** `getSession` already
  verifies the key; `BetterAuthProvider` then called `verifyApiKey` again,
  halving the plugin's limit and quota. The provider now reads the key's row by
  id through `auth.$context` and falls back to `verifyApiKey` only when the row
  is not in the database. A key that Better Auth rejects inside `getSession`
  (rate limit, expiry) now yields 401 instead of an unhandled error.
