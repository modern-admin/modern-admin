---
'@modern-admin/core': minor
'@modern-admin/adapter-prisma': patch
'@modern-admin/react': minor
'@modern-admin/nest': minor
'@modern-admin/graphql': minor
'@modern-admin/feature-m2m': patch
---

Add collision-free structured filter criteria across core, REST, React, dashboards, and GraphQL. New clients keep operators separate from user values, while core continues to read legacy operator-prefixed strings. Structured numeric and date ranges are translated consistently by both ORM adapters. Prisma empty/non-empty filters now respect database nullability, including required references. GraphQL replaces the legacy `filter` argument with a typed `where` argument. Remove the unused server-branding `logo` and `theme` options.
