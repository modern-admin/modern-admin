#!/usr/bin/env bun
/**
 * Iterates all publishable workspace packages and calls
 * `scripts/publish-package.ts` for each. Designed to be invoked AFTER
 * `changeset publish` would have run (or directly from the GitHub
 * Actions release workflow) — assumes:
 *
 *   - `package.json` `version` fields are already at their target
 *     values (changesets/action did `bun version-packages` before this).
 *   - `BUN_AUTH_TOKEN` is set in the environment so `bun publish` can
 *     authenticate against the registry configured in each package's
 *     `publishConfig.registry`.
 *
 * Publishable = lives under `packages/*` OR `apps/*` AND has a `name`
 * starting with `@modern-admin/` AND is not in the explicit deny list
 * (reference apps, docs site).
 *
 * Errors are collected but execution continues so that a failure
 * publishing one package doesn't strand the others. The exit code is
 * non-zero if anything failed.
 */

import { readFile, readdir } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLISH_SCRIPT = join(REPO_ROOT, 'scripts/publish-package.ts')
const BUN_BIN = process.execPath

/** Names we never publish, regardless of where they sit. */
const DENY_LIST = new Set<string>([
  '@modern-admin/app-shared',
  '@modern-admin/app-api',
  '@modern-admin/app-api-prisma',
  '@modern-admin/app-web',
  '@modern-admin/app-e2e',
  '@modern-admin/docs',
])

interface DiscoveredPkg {
  name: string
  version: string
  dir: string
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T
}

async function discover(): Promise<DiscoveredPkg[]> {
  const out: DiscoveredPkg[] = []
  for (const root of ['packages', 'apps']) {
    const absRoot = join(REPO_ROOT, root)
    let entries: string[]
    try {
      entries = await readdir(absRoot)
    } catch {
      continue
    }
    for (const name of entries) {
      const pkgJson = join(absRoot, name, 'package.json')
      try {
        const pkg = await readJson<{ name: string; version: string }>(pkgJson)
        if (!pkg.name) continue
        if (DENY_LIST.has(pkg.name)) continue
        if (!pkg.name.startsWith('@modern-admin/')) continue
        out.push({ name: pkg.name, version: pkg.version, dir: join(root, name) })
      } catch {
        // package.json missing or unreadable — skip silently.
      }
    }
  }
  // Stable order — alphabetical by name.
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

function run(args: string[], cwd: string): number {
  const r = spawnSync(BUN_BIN, args, { cwd, stdio: 'inherit', env: process.env })
  return r.status ?? 1
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')
  const pkgs = await discover()
  console.log(`Found ${pkgs.length} publishable package(s):`)
  for (const p of pkgs) console.log(`  · ${p.name}@${p.version} (${p.dir})`)
  console.log()

  const failures: { pkg: string; code: number }[] = []
  for (const pkg of pkgs) {
    const args = [PUBLISH_SCRIPT, join(REPO_ROOT, pkg.dir)]
    if (dryRun) args.push('--dry-run')
    const code = run(args, REPO_ROOT)
    if (code !== 0) failures.push({ pkg: pkg.name, code })
  }

  if (failures.length > 0) {
    console.error('\nRelease completed with failures:')
    for (const f of failures) console.error(`  ✗ ${f.pkg} (exit ${f.code})`)
    process.exit(1)
  }
  console.log('\n✓ All packages published successfully.')
}

await main()
