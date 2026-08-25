# Release process

Modern Admin publishes the public `@modern-admin/*` packages to npm through an
automated Changesets workflow. Contributors describe release-worthy changes in
their pull requests; maintainers decide when the accumulated changes are ready
to ship.

```text
feature or fix PRs
        |
        v
     develop ----> version PR ----> develop
                                      |
                                      v
                              release PR to main
                                      |
                                      v
                                  npm publish
```

`develop` is the integration branch. `main` contains approved release
snapshots and is the only branch from which packages are published.

## Contributing a release-worthy change

Create a short-lived branch from `develop` and open the pull request back to
`develop`:

```bash
git switch develop
git pull --ff-only origin develop
git switch -c feature/short-description
```

Changes to a published package must include a Changesets entry:

```bash
bun changeset
```

Select the packages affected by the change, choose the appropriate semantic
version bump, and write the summary for package consumers:

- `patch` for a backwards-compatible bug fix;
- `minor` for a backwards-compatible feature or public API addition;
- `major` for a breaking API or behaviour change.

The summary becomes part of the generated package changelog. Repository-only
documentation, tests, CI, and internal tooling do not require a changeset when
published packages are unaffected.

Before opening a pull request, run the checks appropriate to the change:

```bash
bun run lint
bun run typecheck
bun run test
```

CI verifies the code and confirms that published-package changes carry release
intent. Ordinary pull requests are squash-merged into `develop` after review.

## Preparing package versions

Changesets collected on `develop` are accumulated into a draft pull request
from `changeset-release/develop`. The pull request is created and updated
automatically; it does not publish packages.

The version pull request shows the exact release result:

- consumed changeset files;
- package version updates;
- generated `CHANGELOG.md` entries;
- synchronized workspace versions in `bun.lock`.

When maintainers decide to release, they review this pull request, confirm the
semantic versions and changelog text, wait for CI, and merge it into `develop`.
Package versions must not be edited manually outside this process.

## Promoting a release to `main`

After the version pull request is merged and `develop` is green, maintainers
open a release pull request from `develop` to `main`. This pull request is the
final review of everything included in the release.

The release pull request must:

- originate from the repository's `develop` branch;
- contain no pending changesets;
- pass typecheck, lint, unit tests, and Playwright tests;
- be merged with a merge commit.

Using a merge commit preserves the relationship between the two long-lived
branches. Squashing or rebasing the release pull request would make already
released integration commits appear again in later comparisons.

## Publishing

Merging the release pull request triggers the release workflow on `main`. The
workflow verifies the release again, builds the public packages, and determines
which package versions are not yet present on npm. Publication proceeds only
when there is something new to publish.

The publishing scripts validate package manifests and internal dependency
ranges before uploading each package. Versions already present on npm are
skipped, which makes retrying an interrupted release safe.

Published packages are available from the
[`@modern-admin` npm organization](https://www.npmjs.com/org/modern-admin).

## Failed or defective releases

If publication fails because of a transient infrastructure or registry error,
maintainers rerun the same release workflow. A retry does not require another
version bump, and already-published packages are skipped.

Published versions are never overwritten. If a release contains a product
defect, the fix follows the normal pull-request flow through `develop` and is
published as a new patch release.

## Maintainer checklist

- [ ] Intended changes and their changesets are merged into `develop`.
- [ ] The version pull request contains the expected versions and changelogs.
- [ ] The version pull request is merged and `develop` is green.
- [ ] The `develop` to `main` release pull request is reviewed and green.
- [ ] The release pull request is merged with a merge commit.
- [ ] The release workflow completes successfully.
- [ ] Published versions are visible on npm.
