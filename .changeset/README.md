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

Versioning and publishing are deliberately separated:

1. Normal pull requests merge into `develop` with their changesets.
2. `.github/workflows/prepare-release.yml` maintains a draft
   `changeset-release/develop` pull request. Merging it into `develop`
   consumes `.changeset/*.md`, bumps package versions, updates changelogs,
   and synchronizes `bun.lock`; it never publishes.
3. A reviewed `develop` -> `main` promotion pull request carries the prepared
   release. It must be merged with a merge commit so the long-lived branches
   retain a shared history.
4. `.github/workflows/release.yml` runs only on `main`, rejects pending
   changesets, and repeats the quality gates. When Changesets detects an
   unpublished version, the protected publish job runs
   `bun scripts/release.ts`. That script skips versions already present on npm,
   so a failed workflow can be retried safely.

`scripts/publish-package.ts` is the final wrapper around `bun publish`. It
applies `publishConfig.{main,types,exports}` overrides before handing the
package manifest to Bun, which does not honour those overrides on its own as
of v1.3.

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
- `create-modern-admin` — CLI scaffolder (renames to `@modern-admin/create`
  pending Phase D); will rejoin the release flow then.
