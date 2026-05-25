# @modern-admin/react

## 2.0.0

### Patch Changes

- [`7683947`](https://github.com/modern-admin/modern-admin/commit/76839473cf5f6fe2cb00d3ecdce1121bd2184bdf) Thanks [@SergiyIva](https://github.com/SergiyIva)! - This commit consolidates the project to use only the api-prisma service, removing the legacy api service from development scripts and TypeScript configuration. It improves UI component behavior by fixing CardContent padding to maintain proper spacing in standalone contexts and adjusting sticky footer margins to eliminate border gaps. The filter encoding logic is corrected to prevent phantom filters when no items are selected in the "is one of" picker. The PrismaLike type is simplified to allow direct PrismaClient assignment without type casting. Additionally, the sidebar component now uses a direct appName variable instead of a translation key.

- Updated dependencies [[`7683947`](https://github.com/modern-admin/modern-admin/commit/76839473cf5f6fe2cb00d3ecdce1121bd2184bdf)]:
  - @modern-admin/core@2.0.0
  - @modern-admin/ui@2.0.0

## 1.1.1

### Patch Changes

- [`8d758e2`](https://github.com/modern-admin/modern-admin/commit/8d758e23623685fac2c0966e04ef9eb1b060cf50) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Remove the full apps/api-prisma-pro directory and ensure-pro-stubs.ts script in favor of a new setup-pro.ts script that creates a symlink to a sibling modern-admin-pro checkout. This approach improves developer ergonomics by allowing navigation and editing of both repos from the open-core working tree without requiring the pro app to be part of the monorepo's public workspaces.

- Updated dependencies [[`8d758e2`](https://github.com/modern-admin/modern-admin/commit/8d758e23623685fac2c0966e04ef9eb1b060cf50)]:
  - @modern-admin/core@1.1.1
  - @modern-admin/i18n@1.1.1
  - @modern-admin/ui@1.1.1

## 1.1.0

### Minor Changes

- [`6d933ba`](https://github.com/modern-admin/modern-admin/commit/6d933ba53f0a91c4c0bf0d480e8be5c46b28f06a) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Add feature flags system to core with set/isActive API. Introduce license signing with generateLicenseKeyPair. Implement extension registry and slot system in React for sidebar/settings/property/route extensions. Add GraphQL subscriptions support with iterator and server. Integrate opt-in telemetry system with MIT license. Add telemetry integration to NestJS bootstrap. Fix cron processor and cache interceptor. Add localization keys across 9 locales. Apply minor component fixes to UI package.

### Patch Changes

- Updated dependencies [[`6d933ba`](https://github.com/modern-admin/modern-admin/commit/6d933ba53f0a91c4c0bf0d480e8be5c46b28f06a)]:
  - @modern-admin/core@1.1.0
  - @modern-admin/i18n@1.1.0
  - @modern-admin/ui@1.1.0

## 1.0.1

### Patch Changes

- [`6ca117b`](https://github.com/modern-admin/modern-admin/commit/6ca117b5305870e4fc6b7fdf70fa721934cb21b2) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Adds a new `showSidebarResourceIds` config option (default: false) that controls

## 1.0.0

### Minor Changes

- [`19b0574`](https://github.com/modern-admin/modern-admin/commit/19b0574fbf7e97afa3d48d5b9a151eda1ed9afd8) Thanks [@SergiyIva](https://github.com/SergiyIva)! - - Add AdminFeatures interface with flags for auditLog, history, webhooks, apiKeys, aiAssistant

### Patch Changes

- Updated dependencies [[`19b0574`](https://github.com/modern-admin/modern-admin/commit/19b0574fbf7e97afa3d48d5b9a151eda1ed9afd8)]:
  - @modern-admin/core@1.0.0
  - @modern-admin/i18n@1.0.0
  - @modern-admin/ui@1.0.0

## 0.1.3

### Patch Changes

- [`07c813a`](https://github.com/modern-admin/modern-admin/commit/07c813abacde92ccc7e926527ad5d58f939c54c5) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Add custom base path support for SPA mounting. The router now accepts a basePath configuration (e.g., /admin) to mount the admin UI at any URL prefix. Navigation primitives (Link, useNavigate) automatically prepend the basepath. Added better-auth middleware, 'values' action support, and new E2E tests for GraphQL mutations and custom actions API.

- [`07c813a`](https://github.com/modern-admin/modern-admin/commit/07c813abacde92ccc7e926527ad5d58f939c54c5) Thanks [@SergiyIva](https://github.com/SergiyIva)! - fix(react): exclude built-in `values` action from list toolbar dropdown

  The `values` built-in action (server-only RPC used by column-filter popovers
  to fetch distinct values) was leaking into the list page's "Actions" toolbar
  because its name was missing from the built-in whitelist in `list-page.tsx`.
  Clicking it issued a no-op request (`field` empty → handler returns `[]`).
  Added `'values'` to `builtInActionNames` so it is filtered out alongside
  `'search'`.

## 0.1.2

### Patch Changes

- [`5685e32`](https://github.com/modern-admin/modern-admin/commit/5685e328b29e6305a2ab1fea60cafe10bfd1e311) Thanks [@SergiyIva](https://github.com/SergiyIva)! - fix(core,cache-redis,react,web,nest): handle BigInt fields and add configurable authBasePath

- Updated dependencies [[`5685e32`](https://github.com/modern-admin/modern-admin/commit/5685e328b29e6305a2ab1fea60cafe10bfd1e311)]:
  - @modern-admin/core@0.1.2
