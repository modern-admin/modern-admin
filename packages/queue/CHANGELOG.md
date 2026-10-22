# @modern-admin/queue

## 0.13.0

### Patch Changes

- Updated dependencies [[`adb5486`](https://github.com/modern-admin/modern-admin/commit/adb5486a838e49e7f565aa19334e745fcad6447b)]:
  - @modern-admin/core@0.13.0

## 0.12.0

### Patch Changes

- [#98](https://github.com/modern-admin/modern-admin/pull/98) [`29c3a22`](https://github.com/modern-admin/modern-admin/commit/29c3a220a81cfa7018eada015fa6644edadab720) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Update external dependencies to the latest stable releases and pin the tested
  versions across packages and generated projects. Refresh the lockfile, move form
  resolvers to v6, and keep TypeScript 7 declaration builds working with the
  TypeScript 6 API alias and an updated unplugin-dts patch.
  
  Align Better Auth lookup indexes across the canonical Prisma and Drizzle
  schemas, reference app, and CLI scaffold. Existing installations should add
  missing indexes through their ORM migration workflow; the Prisma generator
  preserves existing models. The 1.7.5 → 1.7.12 upgrade itself adds no columns.
  
  Include `prisma.config.ts` in generated hosts so Prisma 7 database commands
  receive `DATABASE_URL` and the configured migration directory.
- Updated dependencies [[`29c3a22`](https://github.com/modern-admin/modern-admin/commit/29c3a220a81cfa7018eada015fa6644edadab720), [`6a24e6d`](https://github.com/modern-admin/modern-admin/commit/6a24e6d6e0fcfac2f17b38191ac7543912773ed1)]:
  - @modern-admin/core@0.12.0

## 0.11.0

### Patch Changes

- [#63](https://github.com/modern-admin/modern-admin/pull/63) [`f0aa056`](https://github.com/modern-admin/modern-admin/commit/f0aa0564aae700ca7b83746087bf6fb7911e3dc6) Thanks [@dependabot](https://github.com/apps/dependabot)! - Update @types/bun to 1.4.2, bullmq to 6.3.8, @types/node to 26.6.2, @changesets/changelog-github to 1.0.1, @changesets/cli to 3.0.3, zod to 4.6.5, jose to 6.2.12, @scalar/nestjs-api-reference to 1.2.19, lucide-react to 1.47.0, dompurify to 3.4.15, marked to 18.0.13 and validate compatibility with the current stable releases.

- [#74](https://github.com/modern-admin/modern-admin/pull/74) [`afdb6ef`](https://github.com/modern-admin/modern-admin/commit/afdb6eff2ddd0399ce81425cafa94bb2f7ec1109) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Update @nestjs/common, @nestjs/core, @nestjs/platform-express, @nestjs/platform-socket.io, @nestjs/testing and @nestjs/websockets to 12.0.3 and validate compatibility with the current stable releases.
- Updated dependencies [[`f0aa056`](https://github.com/modern-admin/modern-admin/commit/f0aa0564aae700ca7b83746087bf6fb7911e3dc6), [`8b8b07e`](https://github.com/modern-admin/modern-admin/commit/8b8b07e152701cdcaa2c7c7f53704b3610787811), [`9ec58d8`](https://github.com/modern-admin/modern-admin/commit/9ec58d8945d3b2aa1f720d371cef371900db1def)]:
  - @modern-admin/core@0.11.0

## 0.10.0

### Minor Changes

- [#40](https://github.com/modern-admin/modern-admin/pull/40) [`cd7e365`](https://github.com/modern-admin/modern-admin/commit/cd7e3659dd1a9c08438edbce726694e4244db32c) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Refresh the monorepo to the latest stable dependency lines. Headline: NestJS
  11 -> 12 across every transport package (`nest`, `graphql`, `queue`,
  `realtime`, `feature-upload`) — including `@nestjs/swagger` 12 and
  `@nestjs/bullmq` 12 — which raises the `@nestjs/*` peer range to `^12`, so
  consumers must move to NestJS 12 as well. Also on bun 1.4 (`@types/bun` 1.4).
  
  Other lines bumped to current stable: Prisma 7.10, BullMQ 6.3, better-auth
  1.7.2, Zod 4.5, jose 6.2, TanStack Query/Router/Table, lucide-react 1.37,
  react-hook-form 7.86, TipTap 3.30.5, Vite 8.2.2, and the AI SDK (`ai` 7.0.84).
  Prisma stays on the 7.x stable line (8.0 is still a release candidate).

### Patch Changes

- [#42](https://github.com/modern-admin/modern-admin/pull/42) [`d7ba345`](https://github.com/modern-admin/modern-admin/commit/d7ba3455830e56f86409c912609e22014e04f802) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Move the toolchain to TypeScript 7 and replace ESLint with oxlint + Prettier.
  Dropping `typescript-eslint` (whose peer pinned `typescript <6.1`) unblocked the
  TypeScript 7 native compiler, which now handles both typecheck and build emit.
  This is a build-time change only — no runtime or public API changes; packages
  are rebuilt with the TS 7 compiler.
- Updated dependencies [[`86b07c4`](https://github.com/modern-admin/modern-admin/commit/86b07c45dc99542f0377d86847c3b9636666e16a), [`d7ba345`](https://github.com/modern-admin/modern-admin/commit/d7ba3455830e56f86409c912609e22014e04f802), [`cd7e365`](https://github.com/modern-admin/modern-admin/commit/cd7e3659dd1a9c08438edbce726694e4244db32c)]:
  - @modern-admin/core@0.10.0

## 0.9.0

### Minor Changes

- [#38](https://github.com/modern-admin/modern-admin/pull/38) [`eb83e7a`](https://github.com/modern-admin/modern-admin/commit/eb83e7a9544faef49416d4510a8d21ed6ea6b565) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Move persistent history pruning out of action hooks and into a BullMQ-backed
  retention cron task. Add equivalent `keepDays`/global `keepLast` retention for
  action logs, including memory, Prisma, and Drizzle store implementations.

### Patch Changes

- Updated dependencies [[`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db), [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db), [`e6d85ae`](https://github.com/modern-admin/modern-admin/commit/e6d85ae69aa955b56f385fa20b451cb3766d3c29), [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db), [`eb83e7a`](https://github.com/modern-admin/modern-admin/commit/eb83e7a9544faef49416d4510a8d21ed6ea6b565)]:
  - @modern-admin/core@0.9.0

## 0.6.0

### Minor Changes

- [`3d2a207`](https://github.com/modern-admin/modern-admin/commit/3d2a2077a466e87da55bf162dcafdb9a8b9bd652) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Refresh the monorepo to the latest stable dependency lines, including
  TypeScript 7, Vite 8.2, TanStack Table 9, BullMQ 6, ioredis 6, Prisma 7.9,
  NestJS 11.2, and the current React/UI toolchain. The table integration now
  uses TanStack Table 9's explicit feature API, and the queue lock processor uses
  BullMQ 6's backend client API. TypeScript 6 remains installed only as the
  temporary JavaScript Compiler API compatibility layer required by ESLint and
  declaration tooling while project compilation runs on TypeScript 7.

## 0.3.0

### Minor Changes

- [`69606d4`](https://github.com/modern-admin/modern-admin/commit/69606d4c2e2ee6204dde978fa59e4454e3ca7ac2) Thanks [@SergiyIva](https://github.com/SergiyIva)! - harden search fallback scan, avoid payload mutation in json-by-key, paginate cache invalidateTags, and make history writes fire-and-forget

## 0.2.1

### Patch Changes

- [`68ee72e`](https://github.com/modern-admin/modern-admin/commit/68ee72e721babf28158274b6fe98e3af8148cf92) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Republish with correct internal dependency ranges. 0.2.0 was published with internal `@modern-admin/*` dependencies pinned to the stale exact version `0.1.1` (bun substitutes `workspace:` ranges from a bun.lock that `changeset version` had not refreshed), which broke consumers with nested-copy resolution errors (`Export named 'recordsTag' not found`). Internal ranges are now published as `^<version>` (`workspace:^`), the release pipeline syncs bun.lock workspace versions after versioning, and publishing aborts if a packed tarball carries a wrong internal range.

## 0.1.1

### Patch Changes

- [`c151019`](https://github.com/modern-admin/modern-admin/commit/c151019f159f41c1574ae6993f582bfd21987983) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Add npm package metadata: a per-package README (install + links back to the Modern Admin repo) plus `homepage` and `keywords` fields for better discoverability on npm.
