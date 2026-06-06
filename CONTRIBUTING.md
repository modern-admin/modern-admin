# Contributing to Modern Admin

Thanks for your interest in contributing! This document covers the setup and
conventions for the open-core monorepo.

## Prerequisites

- **[Bun](https://bun.sh) ≥ 1.3** — the project's package manager and test
  runner. Do not use npm/yarn/pnpm.
- **Docker** (optional) — for local Postgres + Redis via `docker compose`.

## Getting started

```sh
git clone https://github.com/modern-admin/modern-admin.git
cd modern-admin
bun install

# optional: local Postgres + Redis
bun run docker:up
```

The repo is a Bun workspaces monorepo:

- `packages/*` — the published `@modern-admin/*` framework packages
  (core abstractions, ORM adapters, NestJS/GraphQL transports, React/UI,
  i18n, …).
- `apps/*` — reference apps and the Playwright e2e harness (private, not
  published).

## Development workflow

```sh
bun run typecheck      # type-check every workspace
bun test               # run unit tests across all packages
bun run build          # build all publishable packages
bun run lint           # lint
```

Run a single package's tests with the workspace filter:

```sh
bun test --cwd packages/core
```

Please make sure `bun test` and `bun run typecheck` pass before opening a PR.

## Architecture rules

- `packages/core` stays free of any specific ORM, transport, or UI library —
  it only defines abstractions and ports. ORM-specific code lives in
  `packages/adapter-*`; transport code in `packages/nest` / `packages/graphql`.
- Validation is **Zod** end-to-end (DTOs, decorator options, form schemas).
- All generated identifiers use **UUID v7** via `uuidv7()` from
  `@modern-admin/core` — never `crypto.randomUUID()` or `nanoid`.
- **No hardcoded user-visible text.** Every UI string is internationalised:
  add the key to `packages/i18n/src/locales/en.ts` and mirror it to all other
  locale files in the same change. `packages/ui` components stay i18n-unaware
  (they take a `labels` prop with English fallbacks); `packages/react` is the
  translation boundary.
- UI is **mobile-first**: base styles target small screens, then `sm:`/`md:`/
  `lg:` enhance.

## Commit & PR conventions

- Use **[Conventional Commits](https://www.conventionalcommits.org/)**:
  `<type>(<scope>): <subject>` where `type` is one of
  `feat | fix | refactor | style | perf | test | docs | chore | build | ci`
  and `scope` is the affected package or layer
  (e.g. `feat(adapter-prisma): …`).
- Add a **changeset** for any change that should trigger a release:

  ```sh
  bun run changeset
  ```

  Pick the affected packages and a semver bump (patch/minor/major). PRs that
  change published packages without a changeset will be flagged in review.
- Keep PRs focused. Describe what changed and why; link any related issue.

## Reporting bugs & security issues

- **Bugs / feature requests** — open a GitHub issue with reproduction steps.
- **Security vulnerabilities** — do **not** open a public issue; follow
  [`SECURITY.md`](./SECURITY.md).

## License

By contributing, you agree that your contributions are licensed under the
project's [MIT License](./LICENSE).
