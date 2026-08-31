# @modern-admin/create

## 0.10.0

### Patch Changes

- [#42](https://github.com/modern-admin/modern-admin/pull/42) [`d7ba345`](https://github.com/modern-admin/modern-admin/commit/d7ba3455830e56f86409c912609e22014e04f802) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Move the toolchain to TypeScript 7 and replace ESLint with oxlint + Prettier.
  Dropping `typescript-eslint` (whose peer pinned `typescript <6.1`) unblocked the
  TypeScript 7 native compiler, which now handles both typecheck and build emit.
  This is a build-time change only — no runtime or public API changes; packages
  are rebuilt with the TS 7 compiler.

- [#40](https://github.com/modern-admin/modern-admin/pull/40) [`cd7e365`](https://github.com/modern-admin/modern-admin/commit/cd7e3659dd1a9c08438edbce726694e4244db32c) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Refresh the monorepo to the latest stable dependency lines. Headline: NestJS
  11 -> 12 across every transport package (`nest`, `graphql`, `queue`,
  `realtime`, `feature-upload`) — including `@nestjs/swagger` 12 and
  `@nestjs/bullmq` 12 — which raises the `@nestjs/*` peer range to `^12`, so
  consumers must move to NestJS 12 as well. Also on bun 1.4 (`@types/bun` 1.4).
  
  Other lines bumped to current stable: Prisma 7.10, BullMQ 6.3, better-auth
  1.7.2, Zod 4.5, jose 6.2, TanStack Query/Router/Table, lucide-react 1.37,
  react-hook-form 7.86, TipTap 3.30.5, Vite 8.2.2, and the AI SDK (`ai` 7.0.84).
  Prisma stays on the 7.x stable line (8.0 is still a release candidate).
- Updated dependencies [[`d7ba345`](https://github.com/modern-admin/modern-admin/commit/d7ba3455830e56f86409c912609e22014e04f802), [`cd7e365`](https://github.com/modern-admin/modern-admin/commit/cd7e3659dd1a9c08438edbce726694e4244db32c)]:
  - @modern-admin/system-drizzle@0.10.0
  - @modern-admin/system-prisma@0.10.0

## 0.9.0

### Minor Changes

- [#39](https://github.com/modern-admin/modern-admin/pull/39) [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Add webhook-driven API Stock image and video generation, dynamic model forms, private task updates, explicit paid-request confirmation, upload-backed record application, product-card actions, and AI assistant media drafts.

### Patch Changes

- Updated dependencies [[`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db), [`e6d85ae`](https://github.com/modern-admin/modern-admin/commit/e6d85ae69aa955b56f385fa20b451cb3766d3c29), [`eb83e7a`](https://github.com/modern-admin/modern-admin/commit/eb83e7a9544faef49416d4510a8d21ed6ea6b565)]:
  - @modern-admin/system-drizzle@0.9.0
  - @modern-admin/system-prisma@0.9.0

## 0.8.0

### Patch Changes

- Updated dependencies [[`2c1d847`](https://github.com/modern-admin/modern-admin/commit/2c1d847b92ea808c629a77537adef51fa798a78d)]:
  - @modern-admin/system-drizzle@0.8.0
  - @modern-admin/system-prisma@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [[`18a001e`](https://github.com/modern-admin/modern-admin/commit/18a001e875d4c5fa4b56592fbe9b1b54f9191558)]:
  - @modern-admin/system-prisma@0.7.0
  - @modern-admin/system-drizzle@0.7.0

## 0.6.0

### Minor Changes

- [`3d2a207`](https://github.com/modern-admin/modern-admin/commit/3d2a2077a466e87da55bf162dcafdb9a8b9bd652) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Require Better Auth 1.7 and adopt its account identity contract across the
  Prisma fragment, Drizzle schema, reference app, and generated scaffold.
  Credential accounts now use `issuer: 'local:credential'`, account identity is
  unique by `(issuer, accountId)`, and adapter-specific PostgreSQL migrations
  backfill populated 1.6 installations while failing closed on unknown providers
  or collisions. Stop authentication writes before running the migration.

- [`a0b80a6`](https://github.com/modern-admin/modern-admin/commit/a0b80a668e02fded1f509e3867a2db46302a5fdc) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Add `modern-admin setup-ui`, which scaffolds a host-owned Vite/React admin
  bundle, adds the required dependency metadata and scripts, and connects it to
  an existing `ModernAdminStaticUiModule` without overwriting custom UI files.

### Patch Changes

- Updated dependencies [[`3d2a207`](https://github.com/modern-admin/modern-admin/commit/3d2a2077a466e87da55bf162dcafdb9a8b9bd652), [`a0b80a6`](https://github.com/modern-admin/modern-admin/commit/a0b80a668e02fded1f509e3867a2db46302a5fdc)]:
  - @modern-admin/system-prisma@0.6.0
  - @modern-admin/system-drizzle@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies []:
  - @modern-admin/system-drizzle@0.5.0
  - @modern-admin/system-prisma@0.5.0

## 0.4.1

### Patch Changes

- Updated dependencies []:
  - @modern-admin/system-drizzle@0.4.1
  - @modern-admin/system-prisma@0.4.1

## 0.3.5

### Patch Changes

- Updated dependencies []:
  - @modern-admin/system-drizzle@0.3.5
  - @modern-admin/system-prisma@0.3.5

## 0.3.4

### Patch Changes

- Updated dependencies []:
  - @modern-admin/system-drizzle@0.3.4
  - @modern-admin/system-prisma@0.3.4

## 0.3.3

### Patch Changes

- Updated dependencies []:
  - @modern-admin/system-drizzle@0.3.3
  - @modern-admin/system-prisma@0.3.3

## 0.3.2

### Patch Changes

- Updated dependencies []:
  - @modern-admin/system-drizzle@0.3.2
  - @modern-admin/system-prisma@0.3.2

## 0.3.0

### Minor Changes

- [`69606d4`](https://github.com/modern-admin/modern-admin/commit/69606d4c2e2ee6204dde978fa59e4454e3ca7ac2) Thanks [@SergiyIva](https://github.com/SergiyIva)! - harden search fallback scan, avoid payload mutation in json-by-key, paginate cache invalidateTags, and make history writes fire-and-forget

### Patch Changes

- [`69606d4`](https://github.com/modern-admin/modern-admin/commit/69606d4c2e2ee6204dde978fa59e4454e3ca7ac2) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Scaffold template no longer hardcodes `@modern-admin/*` dependency versions
  (previously stuck at `^0.1.0`, a line with the known recordsTag crash). The
  template now carries a `^{{modernAdminVersion}}` token and the CLI substitutes
  its own package version at scaffold time, so `bun create @modern-admin` always
  pins the current release line. Guarded by tests in `test/template.test.ts`.
- Updated dependencies [[`69606d4`](https://github.com/modern-admin/modern-admin/commit/69606d4c2e2ee6204dde978fa59e4454e3ca7ac2), [`69606d4`](https://github.com/modern-admin/modern-admin/commit/69606d4c2e2ee6204dde978fa59e4454e3ca7ac2)]:
  - @modern-admin/system-drizzle@0.3.0
  - @modern-admin/system-prisma@0.3.0

## 0.2.1

### Patch Changes

- [`68ee72e`](https://github.com/modern-admin/modern-admin/commit/68ee72e721babf28158274b6fe98e3af8148cf92) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Republish with correct internal dependency ranges. 0.2.0 was published with internal `@modern-admin/*` dependencies pinned to the stale exact version `0.1.1` (bun substitutes `workspace:` ranges from a bun.lock that `changeset version` had not refreshed), which broke consumers with nested-copy resolution errors (`Export named 'recordsTag' not found`). Internal ranges are now published as `^<version>` (`workspace:^`), the release pipeline syncs bun.lock workspace versions after versioning, and publishing aborts if a packed tarball carries a wrong internal range.

- [`68ee72e`](https://github.com/modern-admin/modern-admin/commit/68ee72e721babf28158274b6fe98e3af8148cf92) Thanks [@SergiyIva](https://github.com/SergiyIva)! - fixed changeset version upgrade of packages

- Updated dependencies [[`68ee72e`](https://github.com/modern-admin/modern-admin/commit/68ee72e721babf28158274b6fe98e3af8148cf92), [`68ee72e`](https://github.com/modern-admin/modern-admin/commit/68ee72e721babf28158274b6fe98e3af8148cf92)]:
  - @modern-admin/system-drizzle@0.2.1
  - @modern-admin/system-prisma@0.2.1

## 0.2.0

### Patch Changes

- Updated dependencies []:
  - @modern-admin/system-drizzle@0.2.0
  - @modern-admin/system-prisma@0.2.0

## 0.1.1

### Patch Changes

- [`c151019`](https://github.com/modern-admin/modern-admin/commit/c151019f159f41c1574ae6993f582bfd21987983) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Add npm package metadata: a per-package README (install + links back to the Modern Admin repo) plus `homepage` and `keywords` fields for better discoverability on npm.

- Updated dependencies [[`c151019`](https://github.com/modern-admin/modern-admin/commit/c151019f159f41c1574ae6993f582bfd21987983)]:
  - @modern-admin/system-drizzle@0.1.1
  - @modern-admin/system-prisma@0.1.1
