#!/usr/bin/env bun
/**
 * Sync `bun.lock` workspace entry versions with the actual
 * `packages/<name>/package.json` / `apps/<name>/package.json` versions.
 *
 * Why: `bun publish` / `bun pm pack` substitute `workspace:^` (and
 * `workspace:*`) ranges using the version recorded in **bun.lock**, not
 * the sibling's manifest. But bun does NOT refresh a workspace entry's
 * `version` field on `bun install` (not even with `--force` or
 * `--lockfile-only`) after `changeset version` bumps the manifests — the
 * lock keeps the pre-bump version, and publishing then embeds a stale
 * internal dependency range. This is exactly how `@modern-admin/*@0.2.0`
 * shipped depending on `@modern-admin/core@0.1.1` (a version its own
 * compiled code was incompatible with).
 *
 * Run as part of `version-packages` (after `changeset version`) so the
 * Version Packages PR carries a lock whose workspace versions match the
 * bumped manifests. `scripts/publish-package.ts` additionally verifies
 * the packed tarball as a last line of defence.
 */

import { readFile, writeFile, readdir } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LOCK_PATH = join(REPO_ROOT, 'bun.lock')
const CORE_INDEX_PATH = join(REPO_ROOT, 'packages/core/src/index.ts')

async function syncCoreFallbackVersion(version: string): Promise<boolean> {
  const original = await readFile(CORE_INDEX_PATH, 'utf8')
  const versionRe = /(const FALLBACK_VERSION = ')[^']+(')/
  if (!versionRe.test(original)) {
    throw new Error(`Could not find FALLBACK_VERSION in ${CORE_INDEX_PATH}`)
  }
  const updated = original.replace(versionRe, `$1${version}$2`)
  if (updated === original) return false
  await writeFile(CORE_INDEX_PATH, updated, 'utf8')
  console.log(`  packages/core/src/index.ts: FALLBACK_VERSION → ${version}`)
  return true
}

async function workspaceVersions(): Promise<Map<string, string>> {
  const versions = new Map<string, string>()
  for (const root of ['packages', 'apps']) {
    let entries: string[]
    try {
      entries = await readdir(join(REPO_ROOT, root))
    } catch {
      continue
    }
    for (const dir of entries) {
      try {
        const pkg = JSON.parse(
          await readFile(join(REPO_ROOT, root, dir, 'package.json'), 'utf8'),
        ) as { version?: string }
        if (pkg.version) versions.set(`${root}/${dir}`, pkg.version)
      } catch {
        // no package.json — skip
      }
    }
  }
  return versions
}

async function main(): Promise<void> {
  const versions = await workspaceVersions()
  const coreVersion = versions.get('packages/core')
  const coreVersionFixed = coreVersion
    ? await syncCoreFallbackVersion(coreVersion)
    : false
  const original = await readFile(LOCK_PATH, 'utf8')
  let lock = original
  let fixes = 0

  for (const [wsPath, version] of versions) {
    // bun.lock is JSONC; edit textually to preserve formatting. Each
    // workspace entry looks like:
    //   "packages/core": {
    //     "name": "@modern-admin/core",
    //     "version": "0.1.1",
    const entryRe = new RegExp(
      `("${wsPath.replace('/', '\\/')}"\\s*:\\s*\\{[^{}]*?"version"\\s*:\\s*")([^"]+)(")`,
    )
    lock = lock.replace(entryRe, (match, head: string, current: string, tail: string) => {
      if (current === version) return match
      fixes += 1
      console.log(`  ${wsPath}: ${current} → ${version}`)
      return `${head}${version}${tail}`
    })
  }

  if (fixes === 0) {
    console.log(
      coreVersionFixed
        ? '✓ core runtime version synced; bun.lock workspace versions already in sync.'
        : 'bun.lock workspace versions and core runtime version already in sync.',
    )
    return
  }
  await writeFile(LOCK_PATH, lock, 'utf8')
  console.log(`✓ bun.lock updated (${fixes} workspace version(s) synced).`)
}

await main()
