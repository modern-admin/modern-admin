---
"@modern-admin/feature-json-by-key": patch
"@modern-admin/auth-better-auth": patch
"@modern-admin/feature-password": patch
"@modern-admin/adapter-drizzle": patch
"@modern-admin/feature-history": patch
"@modern-admin/adapter-prisma": patch
"@modern-admin/feature-upload": patch
"@modern-admin/system-drizzle": patch
"@modern-admin/system-prisma": patch
"@modern-admin/cache-redis": patch
"@modern-admin/feature-m2m": patch
"@modern-admin/telemetry": patch
"@modern-admin/realtime": patch
"@modern-admin/tsconfig": patch
"@modern-admin/graphql": patch
"@modern-admin/license": patch
"@modern-admin/create": patch
"@modern-admin/queue": patch
"@modern-admin/react": patch
"@modern-admin/core": patch
"@modern-admin/i18n": patch
"@modern-admin/nest": patch
"@modern-admin/web": patch
"@modern-admin/ui": patch
---

Remove the full apps/api-prisma-pro directory and ensure-pro-stubs.ts script in favor of a new setup-pro.ts script that creates a symlink to a sibling modern-admin-pro checkout. This approach improves developer ergonomics by allowing navigation and editing of both repos from the open-core working tree without requiring the pro app to be part of the monorepo's public workspaces.
