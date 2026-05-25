---
"@modern-admin/adapter-prisma": patch
"@modern-admin/system-prisma": patch
"@modern-admin/feature-m2m": patch
"@modern-admin/graphql": patch
"@modern-admin/create": patch
"@modern-admin/react": patch
"@modern-admin/core": patch
"@modern-admin/ui": patch
---

This commit consolidates the project to use only the api-prisma service, removing the legacy api service from development scripts and TypeScript configuration. It improves UI component behavior by fixing CardContent padding to maintain proper spacing in standalone contexts and adjusting sticky footer margins to eliminate border gaps. The filter encoding logic is corrected to prevent phantom filters when no items are selected in the "is one of" picker. The PrismaLike type is simplified to allow direct PrismaClient assignment without type casting. Additionally, the sidebar component now uses a direct appName variable instead of a translation key.
