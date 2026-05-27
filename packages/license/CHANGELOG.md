# @modern-admin/license

## 2.0.1

### Patch Changes

- [`bfcac54`](https://github.com/modern-admin/modern-admin/commit/bfcac5448e5c30725c8729489832be2d6beeb709) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Removed deprecated skill documentation and performed codebase cleanup including ESLint config updates, adapter refactoring, and React component improvements across all packages.

## 1.1.1

### Patch Changes

- [`8d758e2`](https://github.com/modern-admin/modern-admin/commit/8d758e23623685fac2c0966e04ef9eb1b060cf50) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Remove the full apps/api-prisma-pro directory and ensure-pro-stubs.ts script in favor of a new setup-pro.ts script that creates a symlink to a sibling modern-admin-pro checkout. This approach improves developer ergonomics by allowing navigation and editing of both repos from the open-core working tree without requiring the pro app to be part of the monorepo's public workspaces.
