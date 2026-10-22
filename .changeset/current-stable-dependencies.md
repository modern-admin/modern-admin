---
'@modern-admin/adapter-drizzle': patch
'@modern-admin/adapter-prisma': patch
'@modern-admin/api-stock': patch
'@modern-admin/auth-better-auth': patch
'@modern-admin/cache-redis': patch
'@modern-admin/core': patch
'@modern-admin/create': patch
'@modern-admin/feature-history': patch
'@modern-admin/feature-json-by-key': patch
'@modern-admin/feature-m2m': patch
'@modern-admin/feature-media-generation': patch
'@modern-admin/feature-password': patch
'@modern-admin/feature-upload': patch
'@modern-admin/graphql': patch
'@modern-admin/i18n': patch
'@modern-admin/license': patch
'@modern-admin/nest': patch
'@modern-admin/queue': patch
'@modern-admin/react': patch
'@modern-admin/realtime': patch
'@modern-admin/system-drizzle': patch
'@modern-admin/system-prisma': patch
'@modern-admin/telemetry': patch
'@modern-admin/ui': patch
'@modern-admin/web': patch
---

Update external dependencies to the latest stable releases and pin the tested
versions across packages and generated projects. Refresh the lockfile, move form
resolvers to v6, and keep TypeScript 7 declaration builds working with the
TypeScript 6 API alias and an updated unplugin-dts patch.

Align Better Auth lookup indexes across the canonical Prisma and Drizzle
schemas, reference app, and CLI scaffold. Existing installations should add
missing indexes through their ORM migration workflow; the Prisma generator
preserves existing models. The 1.7.5 → 1.7.12 upgrade itself adds no columns.
