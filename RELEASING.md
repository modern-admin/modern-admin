# Releasing — universal publish procedure

This is the procedure for getting a code change from a working tree to
published `@modern-admin/*` packages on GitHub Packages. Use it for every
release without exception.

The repo uses **Changesets** for version bumps and a **GitHub Actions
release workflow** (`.github/workflows/release.yml`) for the actual
publish. You never run `bun publish` locally — CI does it.

---

## 0. Prerequisites (one-time setup)

- You are on the default branch (`main`).
- Working tree is **clean** (`git status` shows nothing) — or contains
  only the change you are about to release.
- `bun install` has been run and `node_modules/` is up to date.
- For repository writes: SSH key configured for `git@github.com`.

No personal access token (PAT) is needed locally. CI publishes with
the workflow-provided `GITHUB_TOKEN`.

---

## 1. Make and verify the change

1. **Edit code.** Stick to the conventions in `CLAUDE.md`
   (Conventional Commits, latest deps, bun-only, etc.).
2. **Run the test suite.** Every test must pass; do not skip or silence
   a failure.

   ```sh
   bun test
   bun run typecheck
   ```

3. **For library packages**, prefer adding a focused test that covers
   the new behaviour (see existing patterns under `packages/*/test/`).
4. **For breaking changes**, add a migration note to the affected
   package's `CHANGELOG.md` *after* the version bump (step 4 fills the
   summary line; you can flesh it out in the same PR).

---

## 2. Write a changeset

Every release MUST be preceded by at least one changeset file. The
file is what tells CI which packages to bump and how (`patch` / `minor`
/ `major`).

```sh
bun changeset
```

The wizard asks:

- **Which packages?** — Tick every package affected by your change. The
  repo is in **linked** mode (`linked: [["@modern-admin/*"]]`) so all
  `@modern-admin/*` packages bump *together* to the same version. Tick
  the ones you actually changed; the linker handles the rest.
- **Major / minor / patch?**
  - `patch` — bug fix, doc-only change, internal refactor.
  - `minor` — additive feature, new public option, new export. No
    breakage.
  - `major` — removed export, renamed option, changed runtime behaviour
    a caller would notice. Requires a migration note.
- **Summary** — one line written in user-facing voice. Examples:
  - `fix(core): normalise BigInt fields to strings in BaseRecord.toJSON`
  - `feat(react): add authBasePath option to AdminClient`

This produces `.changeset/<random-name>.md`. **Open it and edit the
body** to a multi-line description if a one-liner is insufficient. The
body lands verbatim in the published `CHANGELOG.md`.

For trivial CI/docs/internal commits with no consumer impact, skip the
changeset entirely — CI will not publish without one.

---

## 3. Commit and push

Follow **Angular Conventional Commits** (`<type>(<scope>): <subject>`):

```sh
git add -A
git commit -m "$(cat <<'EOF'
fix(core,cache-redis): handle BigInt fields in record/JSON pipeline

* @modern-admin/core: BaseRecord.toJSON normalises BigInt → string
* @modern-admin/cache-redis: defensive sentinel-based BigInt round-trip

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
git push origin main
```

- **Type** — `fix` | `feat` | `refactor` | `perf` | `docs` | `test` |
  `chore` | `build` | `ci`.
- **Scope** — affected package short name(s). Multiple packages →
  comma-separated, no spaces (`core,react,web`).
- **Subject** — imperative mood, ≤72 chars, no trailing period.
- **Body** — one bullet per package with what changed. Wrap at 72.
- **Co-Authored-By** — required by repo convention; preserve it.

NEVER bypass hooks (`--no-verify`) — if a pre-commit/pre-push hook
fires, fix the underlying issue and recommit (do not amend; create a
new commit).

NEVER use `git push --force` to `main`. If the remote rejected because
someone else pushed, `git pull --rebase` first.

---

## 4. Let CI run

The `release.yml` workflow fires on every push to `main`. It does
this:

1. `bun install`
2. `prisma generate` (apps/api-prisma needs it for typecheck)
3. `bun run typecheck`
4. `bun --filter '*' build`
5. **Branching point**:
   - If any `.changeset/*.md` files exist → it opens or updates a PR
     titled **"chore: version packages"** that:
     - Deletes the changesets,
     - Bumps every linked package's `package.json` `version`,
     - Updates each affected package's `CHANGELOG.md`,
     - Updates `bun.lock`.
   - If no changesets are pending (Version Packages PR was just
     merged) → it runs `bun run release`, which calls
     `scripts/release.ts`, which iterates publishable packages and
     `bun publish`es each one to `https://npm.pkg.github.com` with
     `access: restricted`.

Open the workflow run on GitHub and watch it to completion. Typical
duration: 4–8 minutes for the bump PR, 6–12 minutes for the publish.

---

## 5. Review and merge the Version Packages PR

When the workflow opens the **"chore: version packages"** PR:

1. **Review the diff.** Check that:
   - Every affected package got the version bump you expected.
   - Each `CHANGELOG.md` entry reads correctly under the new version
     header.
   - `bun.lock` updated for the version bumps and nothing else.
2. **If the changeset summary needs cleanup**, push commits onto the
   PR branch (the workflow keeps `bun.lock` in sync on re-run).
3. **Merge with "Squash and merge".** The squash commit message
   follows the PR title (`chore: version packages`).

Do not delete the PR or close it without merging — the new versions
exist only in that branch until you do.

---

## 6. CI publishes

The merge-commit-on-`main` triggers `release.yml` a second time. With
no pending changesets, it now publishes. Watch the run for green
checkmarks on every `bun publish` step.

Confirm on GitHub Packages
(`https://github.com/orgs/modern-admin/packages`) that the new
versions appear with the expected `published <X> ago` timestamps.

If a publish step fails:

- **`403 Forbidden`** — the workflow's `permissions:` block is missing
  `packages: write`, or the package name doesn't match the org. Fix
  the workflow and push.
- **`409 Conflict` (version already exists)** — someone re-ran the
  release on an old SHA. Bump versions again via a new changeset.
- **`E401`** — the `.npmrc` setup step failed; check the workflow log
  for env-var interpolation issues.

---

## 7. Consume the new version downstream

In a consumer project (e.g. `rustore/admin-service`):

```sh
bun add @modern-admin/core@latest @modern-admin/nest@latest \
        @modern-admin/web@latest   # …every package you depend on
```

Because the repo is in **linked** mode, every `@modern-admin/*` package
shares the same version after each release. Bumping them in lockstep
is the supported path; mixing versions is not.

Verify the consumer typechecks (`bun run typecheck`) and boots
(`bun run dev`) before announcing the release.

---

## TL;DR — one-screen cheat sheet

```sh
# 1. edit code + tests
bun test && bun run typecheck

# 2. write a changeset
bun changeset            # → .changeset/<name>.md, edit if needed

# 3. commit (Conventional Commits + Co-Authored-By) and push
git add -A
git commit -m "feat(scope): summary"
git push origin main

# 4. wait for release.yml to open the "chore: version packages" PR
# 5. review the bumped versions + CHANGELOG, then Squash-merge it
# 6. wait for release.yml to publish on the merge commit
# 7. consumers: bun add @modern-admin/<pkg>@latest
```

---

## What NOT to do

- **Do not run `bun publish` locally.** It bypasses the version-bump
  flow and you'll end up with a published version that has no
  matching `CHANGELOG.md` entry.
- **Do not edit `package.json#version` by hand.** Changesets owns it.
- **Do not skip the changeset for a "small" fix.** A change without a
  changeset is invisible to consumers — no CHANGELOG, no `latest`
  bump, no `bun add @latest` upgrade.
- **Do not force-push to `main`.** It rewrites history that CI has
  already acted on.
- **Do not publish from a feature branch.** Only `main` triggers the
  publish workflow.
- **Do not mix unrelated changes into one changeset.** One
  changeset = one user-facing change. Multiple changesets are fine in
  one PR.
