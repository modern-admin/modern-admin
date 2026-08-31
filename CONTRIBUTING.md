# Contributing to Modern Admin

Thanks for your interest in contributing! This document covers setup,
architecture conventions, and the protected branch flow for the open-core
monorepo.

## Branch model

`develop` is the integration branch and default pull-request target. `main`
contains release snapshots and is the only branch that publishes to npm.

```text
feature/* -> pull request -> develop -> version PR -> develop
                                                    |
                                                    v
                                      release PR -> main -> npm
```

| Branch                          | Purpose                                       | Normal merge method            |
| ------------------------------- | --------------------------------------------- | ------------------------------ |
| `main`                          | Release snapshots and the only publish source | Merge commit from `develop`    |
| `develop`                       | Feature, fix, docs, and chore integration     | Squash merge                   |
| `feature/*`, `fix/*`, `chore/*` | Short-lived work branched from `develop`      | Deleted after merge            |
| `changeset-release/develop`     | Bot-maintained package-version PR             | Squash merge at release cutoff |

Do not push directly to `develop` or `main`. Ordinary work must not target
`main`; the branch-policy workflow rejects it.

## Prerequisites

- **[Bun](https://bun.sh) >= 1.3** — the package manager and test runner. Do
  not use npm, yarn, or pnpm.
- **Docker** (optional) — for local Postgres and Redis via Docker Compose.

## Getting started

```bash
git clone https://github.com/modern-admin/modern-admin.git
cd modern-admin
git switch develop
bun install

# Optional: local Postgres and Redis
bun run docker:up
```

The repository is a Bun workspaces monorepo:

- `packages/*` contains published `@modern-admin/*` framework packages.
- `apps/*` contains private reference apps and the Playwright harness.

## Development workflow

Start each change from the latest integration branch:

```bash
git switch develop
git pull --ff-only origin develop
git switch -c feature/short-description
```

Use the root quality commands as appropriate:

```bash
bun run typecheck
bun run test
bun run build
bun run lint
```

Run a focused package test with:

```bash
bun test --cwd packages/core
```

Code changes must pass lint and relevant focused tests before opening a PR.
Run the complete gates for large or cross-package changes.

## Architecture rules

- `packages/core` stays free of any specific ORM, transport, or UI library. It
  defines abstractions and ports; ORM code belongs in `packages/adapter-*` and
  transport code in `packages/nest` or `packages/graphql`.
- Validation is Zod end to end: DTOs, decorator options, and form schemas.
- Generated identifiers use UUID v7 through `uuidv7()` from
  `@modern-admin/core`, never `crypto.randomUUID()` or `nanoid`.
- Do not hardcode user-visible text. Add each key to
  `packages/i18n/src/locales/en.ts` and mirror it in every locale in the same
  change. `packages/ui` remains i18n-unaware through `labels` props;
  `packages/react` is the translation boundary.
- UI is mobile-first: base styles target small screens and responsive variants
  progressively enhance them.

See `CLAUDE.md` for the complete repository rules.

## Commit and pull-request conventions

- Use [Conventional Commits](https://www.conventionalcommits.org/):
  `<type>(<scope>): <subject>`, where `type` is one of `feat`, `fix`,
  `refactor`, `style`, `perf`, `test`, `docs`, `chore`, `build`, or `ci`.
- Keep PRs focused and explain what changed and why.
- Target `develop` and prefer squash merge so one reviewed change becomes one
  integration commit.
- Add a changeset for every change to a published package:

  ```bash
  bun changeset
  ```

  Choose the affected packages and a patch, minor, or major bump. Repository-
  only docs, tests, CI, and internal tooling do not need a changeset when they
  do not affect consumers. CI verifies this with `changeset status`.

## Releasing

The release owner merges the bot-maintained version PR into `develop`, reviews
the resulting `develop` -> `main` promotion PR, and merges that promotion with
a merge commit. Never squash or rebase the promotion: preserving `develop` as
an ancestor of `main` prevents released commits from reappearing next time.

See [`RELEASING.md`](./RELEASING.md) for the public release lifecycle and
maintainer checklist.

## Reporting bugs and security issues

- **Bugs and feature requests** — open a GitHub issue with reproduction steps.
- **Security vulnerabilities** — do not open a public issue; follow
  [`SECURITY.md`](./SECURITY.md).

## License

By contributing, you agree that your contributions are licensed under the
project's [MIT License](./LICENSE).
