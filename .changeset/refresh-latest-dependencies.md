---
'@modern-admin/adapter-drizzle': patch
'@modern-admin/adapter-prisma': patch
'@modern-admin/cache-redis': minor
'@modern-admin/core': patch
'@modern-admin/feature-history': patch
'@modern-admin/feature-json-by-key': patch
'@modern-admin/feature-m2m': patch
'@modern-admin/feature-password': patch
'@modern-admin/feature-upload': patch
'@modern-admin/graphql': patch
'@modern-admin/i18n': patch
'@modern-admin/license': patch
'@modern-admin/nest': patch
'@modern-admin/queue': minor
'@modern-admin/react': patch
'@modern-admin/realtime': patch
'@modern-admin/telemetry': patch
'@modern-admin/ui': patch
'@modern-admin/web': patch
---

Refresh the monorepo to the latest stable dependency lines, including
TypeScript 7, Vite 8.2, TanStack Table 9, BullMQ 6, ioredis 6, Prisma 7.9,
NestJS 11.2, and the current React/UI toolchain. The table integration now
uses TanStack Table 9's explicit feature API, and the queue lock processor uses
BullMQ 6's backend client API. TypeScript 6 remains installed only as the
temporary JavaScript Compiler API compatibility layer required by ESLint and
declaration tooling while project compilation runs on TypeScript 7.
