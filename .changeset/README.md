# Changesets

This directory tracks unreleased changes for the publishable
`@modern-admin/*` packages. Every user-visible change should ship with a
changeset file describing what changed and at what semver level (patch /
minor / major).

## Adding a change

Run from the repository root:

```bash
bun changeset
```

The interactive prompt lets you pick the affected packages and bump
level, then writes a markdown file under `.changeset/` (commit it
alongside your code change).

All `@modern-admin/*` packages are **linked**: a bump on any one of them
bumps the rest to the same version. This keeps cross-package dependency
versions in lockstep and removes a class of "wrong peer version"
failures for downstream consumers.

## Releasing

CI handles the actual release on `main`:

1. The `release` workflow opens / updates a "Version Packages" PR using
   `changesets/action`.
2. Merging that PR consumes the staged `.changeset/*.md` files, bumps
   `version` fields, and updates `CHANGELOG.md`s.
3. The post-merge run of the same workflow detects there are no pending
   changesets, builds every package, and runs `bun scripts/release.ts`
   which iterates each publishable package and calls
   `scripts/publish-package.ts` — a thin wrapper around `bun publish`
   that applies `publishConfig.{main,types,exports}` overrides before
   handing the package.json to bun (bun does not honour those overrides
   on its own as of v1.3).

Manual one-off release of a single package (rarely needed):

```bash
BUN_AUTH_TOKEN=ghp_... \
  bun scripts/publish-package.ts packages/<name>
```

## Ignored packages

The following workspace packages never enter the release flow (see
`config.json` → `ignore`):

- `apps/*` — reference demo apps, never published
- `apps/_shared` (`@modern-admin/app-shared`) — internal-only utilities
  shared by the demo apps
- `apps/docs` (`@modern-admin/docs`) — documentation site
- `create-modern-admin` — CLI scaffolder (renames to `@modern-admin/create`
  pending Phase D); will rejoin the release flow then.
