---
'@modern-admin/core': minor
'@modern-admin/cache-redis': minor
'@modern-admin/nest': minor
'@modern-admin/react': minor
'@modern-admin/i18n': patch
---

Harden server caching across processes and expose cache observability.

- Route all framework reads, writes, and invalidations through a fail-open
  `CacheRuntime` with tag-generation fencing, invalidation retry/quarantine,
  TTL jitter, metrics, and optional distributed single-flight locks.
- Make Redis value/tag/reverse-index writes atomic, add cross-instance tag
  epochs, token-safe locks, exact delete/overwrite cleanup, and monotonic tag
  TTLs.
- Version and canonicalize action and HTTP keys, fix bounded in-memory LRU tag
  semantics, and actively revoke cached role permissions across replicas.
- Scope HTTP entries per principal, bypass dynamic access predicates, and tie
  cached responses to role-permission invalidation.
- Add protected cache stats/reset/resource-invalidation endpoints and a
  localized Cache diagnostics screen.
