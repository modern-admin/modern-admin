---
"@modern-admin/adapter-drizzle": patch
"@modern-admin/adapter-prisma": patch
"@modern-admin/auth-better-auth": patch
"@modern-admin/cache-redis": patch
"@modern-admin/core": patch
"@modern-admin/create": patch
"@modern-admin/feature-history": patch
"@modern-admin/feature-json-by-key": patch
"@modern-admin/feature-m2m": patch
"@modern-admin/feature-password": patch
"@modern-admin/feature-upload": patch
"@modern-admin/graphql": patch
"@modern-admin/i18n": patch
"@modern-admin/license": patch
"@modern-admin/nest": patch
"@modern-admin/queue": patch
"@modern-admin/react": patch
"@modern-admin/realtime": patch
"@modern-admin/system-drizzle": patch
"@modern-admin/system-prisma": patch
"@modern-admin/telemetry": patch
"@modern-admin/tsconfig": patch
"@modern-admin/ui": patch
"@modern-admin/web": patch
---

Republish with correct internal dependency ranges. 0.2.0 was published with internal `@modern-admin/*` dependencies pinned to the stale exact version `0.1.1` (bun substitutes `workspace:` ranges from a bun.lock that `changeset version` had not refreshed), which broke consumers with nested-copy resolution errors (`Export named 'recordsTag' not found`). Internal ranges are now published as `^<version>` (`workspace:^`), the release pipeline syncs bun.lock workspace versions after versioning, and publishing aborts if a packed tarball carries a wrong internal range.
