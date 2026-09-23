---
'@modern-admin/nest': minor
---

`GET /admin/api/auth/me` no longer returns the role's `permissions` matrix — the response is now just `{ user }`.

The field existed so the SPA could hide controls it could not use. That job now
belongs to `/admin/api/config`, whose action descriptors are pruned per
principal by `ModernAdmin.toJSON(currentAdmin)`, so the matrix was both unused
and a second copy of the same verdict that could drift from it. Server-side
enforcement was never affected either way — it runs in `invoke()`.

Consumers that read `permissions` from this endpoint should derive the same
answer from the action descriptors in `/admin/api/config`, or call
`ModernAdmin.getRolePermissions(role)` directly, which is unchanged.
