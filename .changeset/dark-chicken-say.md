---
'@modern-admin/auth-better-auth': patch
'@modern-admin/nest': patch
'@modern-admin/i18n': patch
'@modern-admin/create': patch
---

Recognize API-key requests through Better Auth's own plugin matchers, preventing
custom header configuration mismatches from bypassing action scopes or reaching
account-management endpoints. `createBetterAuthMiddleware` now requires the same
Better Auth instance via `{ auth }`; update existing middleware mounts accordingly.

Limit built-in API-key opt-ins to individual resource/search handlers, keeping
future controller methods closed by default. Translate API-key and time-series
permission errors using Accept-Language and all nine bundled locales.
