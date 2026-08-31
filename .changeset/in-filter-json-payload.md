---
'@modern-admin/core': minor
'@modern-admin/react': minor
'@modern-admin/nest': minor
'@modern-admin/graphql': minor
'@modern-admin/feature-m2m': patch
---

Add collision-free structured filter criteria across core, REST, React, dashboards, and GraphQL. New clients keep operators separate from user values, while core continues to read legacy operator-prefixed strings. GraphQL gains a typed `where` argument and retains the deprecated legacy `filter` argument.
