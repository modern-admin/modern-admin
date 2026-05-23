---
"@modern-admin/create": patch
"@modern-admin/react": patch
"@modern-admin/nest": patch
"@modern-admin/web": patch
---

Add custom base path support for SPA mounting. The router now accepts a basePath configuration (e.g., /admin) to mount the admin UI at any URL prefix. Navigation primitives (Link, useNavigate) automatically prepend the basepath. Added better-auth middleware, 'values' action support, and new E2E tests for GraphQL mutations and custom actions API.
