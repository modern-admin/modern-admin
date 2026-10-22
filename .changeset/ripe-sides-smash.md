---
'@modern-admin/core': patch
'@modern-admin/adapter-prisma': patch
'@modern-admin/adapter-drizzle': patch
'@modern-admin/nest': patch
'@modern-admin/react': minor
---

Add a refresh button to record show pages that bypasses browser, HTTP and action caches,
reads current database values, and invalidates stale related scopes when data changes.
Fence older in-flight reads and mutations during revalidation so stale responses cannot
overwrite refreshed cache entries.

Keep custom record-action descriptors available until dynamic access predicates can be
evaluated against the loaded record. Preserve role, API-key and static access denials.

Resolve relation filters using the actual referenced unique column in Prisma and Drizzle,
with independent lookup memoization and property access checks. Reject composite mappings
that scalar relation traversal cannot preserve.
