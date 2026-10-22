---
'@modern-admin/auth-better-auth': patch
'@modern-admin/nest': patch
---

Security: API keys no longer act with their owner's full role outside the action gate.

Better Auth's api-key plugin turns a key into a session of its owner; only the
`apiKey` claim narrows that session, and only `ModernAdmin.invoke()` /
`canAccess()` read it. Two paths let a scoped key escape:

- **`BetterAuthProvider.getCurrentUser` failed open.** When `verifyApiKey`
  threw or reported the key invalid — which is exactly what happens once the
  plugin's rate limit or `remaining` quota trips, since `getSession` and
  `verifyApiKey` each consume a slot — the principal was returned without the
  claim, i.e. with the owner's unrestricted role. It now returns `null` in that
  case, when the api-key plugin is not mounted, and when the verified key is
  not the one the session was minted from. New `apiKeyHeaders` option mirrors
  the plugin's setting (default `'x-api-key'`).
- **Endpoints outside `invoke()` ignored the key's scope.** Audit log, record
  history, webhooks, dashboard, analytics, AI assistant and media generation
  served a key like its owner's session. `ModernAdminAuthGuard` now answers 403
  to API-key principals unless the route is marked with the new
  `@AllowApiKey()` decorator; resource actions, global search and
  `GET /admin/api/auth/me` are marked. Host controllers behind the guard are
  closed to keys until they opt in.
- **Better Auth's own endpoints accepted keys.** `createBetterAuthMiddleware`
  now answers 403 (`API_KEY_NOT_ALLOWED`) to any request presenting an API key
  on Better Auth paths, so a key can no longer read `/get-session`,
  `/list-sessions` (the owner's live session tokens) or mint an unrestricted
  key via `/api-key/create`. Pass `{ apiKeyHeaders }` for custom key headers,
  and mount Better Auth through this middleware rather than a bare
  `toNodeHandler(auth)`.
