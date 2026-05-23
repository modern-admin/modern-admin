# @modern-admin/web

## 0.1.3

### Patch Changes

- [`07c813a`](https://github.com/modern-admin/modern-admin/commit/07c813abacde92ccc7e926527ad5d58f939c54c5) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Add custom base path support for SPA mounting. The router now accepts a basePath configuration (e.g., /admin) to mount the admin UI at any URL prefix. Navigation primitives (Link, useNavigate) automatically prepend the basepath. Added better-auth middleware, 'values' action support, and new E2E tests for GraphQL mutations and custom actions API.

- Updated dependencies [[`07c813a`](https://github.com/modern-admin/modern-admin/commit/07c813abacde92ccc7e926527ad5d58f939c54c5), [`07c813a`](https://github.com/modern-admin/modern-admin/commit/07c813abacde92ccc7e926527ad5d58f939c54c5)]:
  - @modern-admin/react@0.1.3

## 0.1.2

### Patch Changes

- [`5685e32`](https://github.com/modern-admin/modern-admin/commit/5685e328b29e6305a2ab1fea60cafe10bfd1e311) Thanks [@SergiyIva](https://github.com/SergiyIva)! - fix(core,cache-redis,react,web,nest): handle BigInt fields and add configurable authBasePath

- Updated dependencies [[`5685e32`](https://github.com/modern-admin/modern-admin/commit/5685e328b29e6305a2ab1fea60cafe10bfd1e311)]:
  - @modern-admin/react@0.1.2
  - @modern-admin/core@0.1.2

## 0.1.1

### Patch Changes

- [`2d695e0`](https://github.com/modern-admin/modern-admin/commit/2d695e043dc11e18a8921d9290fa6b3b4aabdc70) Thanks [@SergiyIva](https://github.com/SergiyIva)! - - create: fix Prisma 7 schema (prisma-client provider, output path, uuid(7) defaults), remove demo Post model and resource, fix BetterAuthProvider import, rename \_gitignore/\_npmrc to dotfiles on scaffold
