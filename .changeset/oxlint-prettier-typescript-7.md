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

Move the toolchain to TypeScript 7 and replace ESLint with oxlint + Prettier.
Dropping `typescript-eslint` (whose peer pinned `typescript <6.1`) unblocked the
TypeScript 7 native compiler, which now handles both typecheck and build emit.
This is a build-time change only — no runtime or public API changes; packages
are rebuilt with the TS 7 compiler.
