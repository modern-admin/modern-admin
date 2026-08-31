# @modern-admin/feature-media-generation

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

### Minor Changes

- [#39](https://github.com/modern-admin/modern-admin/pull/39) [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db) Thanks [@SergiyIva](https://github.com/SergiyIva)! - Add webhook-driven API Stock image and video generation, dynamic model forms, private task updates, explicit paid-request confirmation, upload-backed record application, product-card actions, and AI assistant media drafts.

### Patch Changes

- Updated dependencies [[`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db), [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db), [`e6d85ae`](https://github.com/modern-admin/modern-admin/commit/e6d85ae69aa955b56f385fa20b451cb3766d3c29), [`5118d63`](https://github.com/modern-admin/modern-admin/commit/5118d63c9e3db18c7e0ce6202c13ab02833780db), [`eb83e7a`](https://github.com/modern-admin/modern-admin/commit/eb83e7a9544faef49416d4510a8d21ed6ea6b565)]:
  - @modern-admin/core@0.9.0
