# Modern Admin — project rules for Claude

## Dependency policy (mandatory)

**Always use the latest available stable versions of all libraries.** Before
adding or upgrading a dependency, check the registry for the latest stable
release and pin to it. Never pick an older version to dodge breaking changes —
adapt the code to the new API instead.

When upgrading, pay attention to the major versions currently locked:

| Package                | Current major   | Notes                                               |
| ---------------------- | --------------- | --------------------------------------------------- |
| typescript             | 6.x             | stricter checks; use `as unknown as T` for variance |
| @nestjs/*              | 11.x            | Node 20+; cache-manager API changed                 |
| zod                    | 4.x             | new error API; `z.email()` instead of `.email()`    |
| vite                   | 8.x             | Node bumped; SSR/Rolldown changes                   |
| @vitejs/plugin-react   | 6.x             | matches Vite 8                                      |
| tailwindcss            | 4.x             | CSS-first config (`@theme`, `@import "tailwindcss"`) — no `tailwind.config.js` |
| @hookform/resolvers    | 5.x             | API tweaks                                          |
| lucide-react           | 1.x             | verify icon names                                   |
| tailwind-merge         | 3.x             |                                                     |
| prisma / @prisma/client| 7.x             | new ESM engine, client API changes                  |
| drizzle-orm            | 0.45.x          | driver API and schema-gen changes                   |
| better-auth            | 1.6+            |                                                     |
| react / react-dom      | 19.x            | use `import type { ReactElement } from 'react'` instead of `JSX.Element` |
| @tanstack/react-query  | 5.x             |                                                     |

When touching one of those, expect to update call sites for the new API.

## Tooling

- **Package manager / runtime: bun.** Use `bun install`, `bun add`, `bun run`,
  `bun test`. Never use npm/yarn/pnpm.
- **Workspaces**: `apps/*` and `packages/*` registered in the root
  `package.json`. Cross-workspace deps use `workspace:*`.
- **TypeScript** presets live in `packages/tsconfig`. Each package extends
  `@modern-admin/tsconfig/node.json` or `react.json`.
- **Bun TS types**: `"types": ["bun"]` (not `bun-types`).
- **NestJS legacy decorators** (apps/api): keep
  `experimentalDecorators: true`, `emitDecoratorMetadata: true`,
  `useDefineForClassFields: false`.
- **Tests**: `bun test`, files in `<pkg>/test/`.
- **Lint/format**: project-wide config TBD; do not introduce a tool without
  asking.

## Architecture rules

- Never tie `packages/core` to a specific ORM, transport, or UI lib. Core only
  defines abstractions (BaseDatabase/BaseResource/BaseProperty/BaseRecord,
  decorators, actions, ports).
- Adapters (`packages/adapter-*`) implement core abstractions for one ORM each.
- Transports (`packages/nest`) consume `ModernAdmin.invoke()` rather than
  reaching into resources directly.
- Auth, cache, and component loading are **ports** (interfaces in core) with
  default no-op implementations and pluggable real ones.
- Validation is **Zod everywhere** — DTOs, decorator options, form schemas.
- Cross-instance cache invalidation goes through Redis pub/sub. WebSocket
  realtime events ride the same channel.

## Code style

- **Shorten import paths.** When importing a package barrel (an `index.ts`
  in a directory), drop `/index.js` from the specifier:
  - Yes: `import { Foo } from '../errors'`
  - No:  `import { Foo } from '../errors/index.js'`

  Bundler `moduleResolution` plus bun resolve the directory's `index.ts`.
  Concrete file paths still carry their `.js` extension
  (e.g. `'../utils/merge-options.js'`). When editing a file,
  opportunistically rewrite existing `…/index.js` specifiers to the short
  form.

## Workflow rules

- Read files before editing them.
- Prefer `Edit` over `Write` when modifying existing files.
- Do not create files unless required for the task.
- Do not create git commits unless the user asks.
- Do not run destructive commands (`rm -rf`, force-push, hard reset, etc.)
  without explicit instruction.
- Match scope: implement what was asked, don't refactor unrelated code.

## Plan reference

Active implementation plan: `/home/sergey/.claude/plans/fizzy-jumping-reef.md`
(9 phases, Phase 0 and Phase 1 complete).
