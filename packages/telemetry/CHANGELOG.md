# @modern-admin/telemetry

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
- Updated dependencies [[`86b07c4`](https://github.com/modern-admin/modern-admin/commit/86b07c45dc99542f0377d86847c3b9636666e16a), [`d7ba345`](https://github.com/modern-admin/modern-admin/commit/d7ba3455830e56f86409c912609e22014e04f802), [`cd7e365`](https://github.com/modern-admin/modern-admin/commit/cd7e3659dd1a9c08438edbce726694e4244db32c)]:
  - @modern-admin/core@0.10.0

## 0.9.0

### Patch Changes

- Updated dependencies [[`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db), [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db), [`e6d85ae`](https://github.com/modern-admin/modern-admin/commit/e6d85ae69aa955b56f385fa20b451cb3766d3c29), [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db), [`eb83e7a`](https://github.com/modern-admin/modern-admin/commit/eb83e7a9544faef49416d4510a8d21ed6ea6b565)]:
  - @modern-admin/core@0.9.0

## 0.8.0

### Minor Changes

- [#21](https://github.com/modern-admin/modern-admin/pull/21) [`b8ad7c2`](https://github.com/modern-admin/modern-admin/commit/b8ad7c2f97a84fe02c66c6992d4d11d0b65e44b9) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Add injectable LLM, admin-client, authentication-route, telemetry, and AI queue
  boundaries; move the shared framework DI token to core; decouple GraphQL from
  the REST transport; and make upload transport dependencies optional peers.

### Patch Changes

- Updated dependencies [[`b8ad7c2`](https://github.com/modern-admin/modern-admin/commit/b8ad7c2f97a84fe02c66c6992d4d11d0b65e44b9)]:
  - @modern-admin/core@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [[`18a001e`](https://github.com/modern-admin/modern-admin/commit/18a001e875d4c5fa4b56592fbe9b1b54f9191558)]:
  - @modern-admin/core@0.7.0

## 0.6.0

### Patch Changes

- [`3d2a207`](https://github.com/modern-admin/modern-admin/commit/3d2a2077a466e87da55bf162dcafdb9a8b9bd652) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Refresh the monorepo to the latest stable dependency lines, including
  TypeScript 7, Vite 8.2, TanStack Table 9, BullMQ 6, ioredis 6, Prisma 7.9,
  NestJS 11.2, and the current React/UI toolchain. The table integration now
  uses TanStack Table 9's explicit feature API, and the queue lock processor uses
  BullMQ 6's backend client API. TypeScript 6 remains installed only as the
  temporary JavaScript Compiler API compatibility layer required by ESLint and
  declaration tooling while project compilation runs on TypeScript 7.
- Updated dependencies [[`3d2a207`](https://github.com/modern-admin/modern-admin/commit/3d2a2077a466e87da55bf162dcafdb9a8b9bd652)]:
  - @modern-admin/core@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [[`4251f7a`](https://github.com/modern-admin/modern-admin/commit/4251f7a6ea01ad80fbd5515a27cec2e138d2ccb5), [`4251f7a`](https://github.com/modern-admin/modern-admin/commit/4251f7a6ea01ad80fbd5515a27cec2e138d2ccb5), [`4251f7a`](https://github.com/modern-admin/modern-admin/commit/4251f7a6ea01ad80fbd5515a27cec2e138d2ccb5)]:
  - @modern-admin/core@0.5.0

## 0.4.1

### Patch Changes

- Updated dependencies [[`d39e559`](https://github.com/modern-admin/modern-admin/commit/d39e559e5e1cdf9fdbba9cd53f3cdf386af6baee), [`d39e559`](https://github.com/modern-admin/modern-admin/commit/d39e559e5e1cdf9fdbba9cd53f3cdf386af6baee)]:
  - @modern-admin/core@0.4.1

## 0.3.5

### Patch Changes

- Updated dependencies [[`fecfa57`](https://github.com/modern-admin/modern-admin/commit/fecfa57a818df221ed21c4bc7ecc12f0a99dbd83), [`fecfa57`](https://github.com/modern-admin/modern-admin/commit/fecfa57a818df221ed21c4bc7ecc12f0a99dbd83)]:
  - @modern-admin/core@0.3.5

## 0.3.4

### Patch Changes

- Updated dependencies [[`596ad7d`](https://github.com/modern-admin/modern-admin/commit/596ad7dd27ec3da2538afcbeb342cac1e707c8e5)]:
  - @modern-admin/core@0.3.4

## 0.3.3

### Patch Changes

- Updated dependencies [[`e92a998`](https://github.com/modern-admin/modern-admin/commit/e92a9983cdd14125ebb4dd0cd9f8062216d18a5c)]:
  - @modern-admin/core@0.3.3

## 0.3.2

### Patch Changes

- Updated dependencies [[`cdc8639`](https://github.com/modern-admin/modern-admin/commit/cdc86393f211e8d10b856d9091baa910a11e739f)]:
  - @modern-admin/core@0.3.2

## 0.3.0

### Patch Changes

- Updated dependencies [[`69606d4`](https://github.com/modern-admin/modern-admin/commit/69606d4c2e2ee6204dde978fa59e4454e3ca7ac2), [`69606d4`](https://github.com/modern-admin/modern-admin/commit/69606d4c2e2ee6204dde978fa59e4454e3ca7ac2), [`69606d4`](https://github.com/modern-admin/modern-admin/commit/69606d4c2e2ee6204dde978fa59e4454e3ca7ac2)]:
  - @modern-admin/core@0.3.0

## 0.2.1

### Patch Changes

- [`68ee72e`](https://github.com/modern-admin/modern-admin/commit/68ee72e721babf28158274b6fe98e3af8148cf92) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Republish with correct internal dependency ranges. 0.2.0 was published with internal `@modern-admin/*` dependencies pinned to the stale exact version `0.1.1` (bun substitutes `workspace:` ranges from a bun.lock that `changeset version` had not refreshed), which broke consumers with nested-copy resolution errors (`Export named 'recordsTag' not found`). Internal ranges are now published as `^<version>` (`workspace:^`), the release pipeline syncs bun.lock workspace versions after versioning, and publishing aborts if a packed tarball carries a wrong internal range.

- [`68ee72e`](https://github.com/modern-admin/modern-admin/commit/68ee72e721babf28158274b6fe98e3af8148cf92) Thanks [@SergiyIva](https://github.com/SergiyIva)! - fixed changeset version upgrade of packages

- Updated dependencies [[`68ee72e`](https://github.com/modern-admin/modern-admin/commit/68ee72e721babf28158274b6fe98e3af8148cf92)]:
  - @modern-admin/core@0.2.1

## 0.2.0

### Patch Changes

- Updated dependencies [[`64f17a6`](https://github.com/modern-admin/modern-admin/commit/64f17a63626ab2990aee38fb035469aed8992e99)]:
  - @modern-admin/core@0.2.0

## 0.1.1

### Patch Changes

- [`c151019`](https://github.com/modern-admin/modern-admin/commit/c151019f159f41c1574ae6993f582bfd21987983) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Add npm package metadata: a per-package README (install + links back to the Modern Admin repo) plus `homepage` and `keywords` fields for better discoverability on npm.

- Updated dependencies [[`c151019`](https://github.com/modern-admin/modern-admin/commit/c151019f159f41c1574ae6993f582bfd21987983)]:
  - @modern-admin/core@0.1.1
