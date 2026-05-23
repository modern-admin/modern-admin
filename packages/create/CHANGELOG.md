# @modern-admin/create

## 1.0.0

### Patch Changes

- Updated dependencies []:
  - @modern-admin/system-drizzle@1.0.0
  - @modern-admin/system-prisma@1.0.0

## 0.1.3

### Patch Changes

- [`07c813a`](https://github.com/modern-admin/modern-admin/commit/07c813abacde92ccc7e926527ad5d58f939c54c5) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Add custom base path support for SPA mounting. The router now accepts a basePath configuration (e.g., /admin) to mount the admin UI at any URL prefix. Navigation primitives (Link, useNavigate) automatically prepend the basepath. Added better-auth middleware, 'values' action support, and new E2E tests for GraphQL mutations and custom actions API.

## 0.1.2

### Patch Changes

- Updated dependencies []:
  - @modern-admin/system-drizzle@0.1.2
  - @modern-admin/system-prisma@0.1.2

## 0.1.1

### Patch Changes

- [`2d695e0`](https://github.com/modern-admin/modern-admin/commit/2d695e043dc11e18a8921d9290fa6b3b4aabdc70) Thanks [@SergiyIva](https://github.com/SergiyIva)! - - create: fix Prisma 7 schema (prisma-client provider, output path, uuid(7) defaults), remove demo Post model and resource, fix BetterAuthProvider import, rename \_gitignore/\_npmrc to dotfiles on scaffold
