---
'@modern-admin/nest': minor
'@modern-admin/graphql': minor
'@modern-admin/queue': minor
'@modern-admin/realtime': minor
'@modern-admin/feature-upload': minor
'@modern-admin/core': patch
'@modern-admin/react': patch
'@modern-admin/ui': patch
'@modern-admin/license': patch
'@modern-admin/adapter-prisma': patch
'@modern-admin/adapter-drizzle': patch
'@modern-admin/system-prisma': patch
'@modern-admin/system-drizzle': patch
'@modern-admin/auth-better-auth': patch
'@modern-admin/cache-redis': patch
'@modern-admin/feature-json-by-key': patch
'@modern-admin/feature-m2m': patch
'@modern-admin/feature-media-generation': patch
'@modern-admin/feature-history': patch
'@modern-admin/feature-password': patch
'@modern-admin/api-stock': patch
'@modern-admin/telemetry': patch
'@modern-admin/i18n': patch
'@modern-admin/create': patch
'@modern-admin/web': patch
---

Refresh the monorepo to the latest stable dependency lines. Headline: NestJS
11 -> 12 across every transport package (`nest`, `graphql`, `queue`,
`realtime`, `feature-upload`) — including `@nestjs/swagger` 12 and
`@nestjs/bullmq` 12 — which raises the `@nestjs/*` peer range to `^12`, so
consumers must move to NestJS 12 as well. Also on bun 1.4 (`@types/bun` 1.4).

Other lines bumped to current stable: Prisma 7.10, BullMQ 6.3, better-auth
1.7.2, Zod 4.5, jose 6.2, TanStack Query/Router/Table, lucide-react 1.37,
react-hook-form 7.86, TipTap 3.30.5, Vite 8.2.2, and the AI SDK (`ai` 7.0.84).
Prisma stays on the 7.x stable line (8.0 is still a release candidate).
