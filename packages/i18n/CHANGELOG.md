# @modern-admin/i18n

## 1.1.1

### Patch Changes

- [`8d758e2`](https://github.com/modern-admin/modern-admin/commit/8d758e23623685fac2c0966e04ef9eb1b060cf50) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Remove the full apps/api-prisma-pro directory and ensure-pro-stubs.ts script in favor of a new setup-pro.ts script that creates a symlink to a sibling modern-admin-pro checkout. This approach improves developer ergonomics by allowing navigation and editing of both repos from the open-core working tree without requiring the pro app to be part of the monorepo's public workspaces.

## 1.1.0

### Patch Changes

- [`6d933ba`](https://github.com/modern-admin/modern-admin/commit/6d933ba53f0a91c4c0bf0d480e8be5c46b28f06a) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Add feature flags system to core with set/isActive API. Introduce license signing with generateLicenseKeyPair. Implement extension registry and slot system in React for sidebar/settings/property/route extensions. Add GraphQL subscriptions support with iterator and server. Integrate opt-in telemetry system with MIT license. Add telemetry integration to NestJS bootstrap. Fix cron processor and cache interceptor. Add localization keys across 9 locales. Apply minor component fixes to UI package.

## 1.0.0

### Minor Changes

- [`19b0574`](https://github.com/modern-admin/modern-admin/commit/19b0574fbf7e97afa3d48d5b9a151eda1ed9afd8) Thanks [@SergiyIva](https://github.com/SergiyIva)! - - Add AdminFeatures interface with flags for auditLog, history, webhooks, apiKeys, aiAssistant
