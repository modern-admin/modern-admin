# @modern-admin/create

## 2.0.0

### Patch Changes

- [`6d933ba`](https://github.com/modern-admin/modern-admin/commit/6d933ba53f0a91c4c0bf0d480e8be5c46b28f06a) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Add feature flags system to core with set/isActive API. Introduce license signing with generateLicenseKeyPair. Implement extension registry and slot system in React for sidebar/settings/property/route extensions. Add GraphQL subscriptions support with iterator and server. Integrate opt-in telemetry system with MIT license. Add telemetry integration to NestJS bootstrap. Fix cron processor and cache interceptor. Add localization keys across 9 locales. Apply minor component fixes to UI package.

- Updated dependencies [[`6d933ba`](https://github.com/modern-admin/modern-admin/commit/6d933ba53f0a91c4c0bf0d480e8be5c46b28f06a)]:
  - @modern-admin/system-prisma@2.0.0
  - @modern-admin/system-drizzle@2.0.0

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
