---
'@modern-admin/auth-better-auth': minor
'@modern-admin/system-prisma': minor
'@modern-admin/system-drizzle': minor
'@modern-admin/create': minor
---

Require Better Auth 1.7 and adopt its account identity contract across the
Prisma fragment, Drizzle schema, reference app, and generated scaffold.
Credential accounts now use `issuer: 'local:credential'`, account identity is
unique by `(issuer, accountId)`, and adapter-specific PostgreSQL migrations
backfill populated 1.6 installations while failing closed on unknown providers
or collisions. Stop authentication writes before running the migration.
