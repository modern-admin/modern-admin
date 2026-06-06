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
])

interface DiscoveredPkg {
  name: string
  version: string
  dir: string
  registry: string
}

const DEFAULT_REGISTRY = 'https://registry.npmjs.org'

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
        const pkg = await readJson<{
          name: string
          version: string
          publishConfig?: { registry?: string }
        }>(pkgJson)
        if (!pkg.name) continue
        if (DENY_LIST.has(pkg.name)) continue
        if (!pkg.name.startsWith('@modern-admin/')) continue
        out.push({
          name: pkg.name,
          version: pkg.version,
          dir: join(root, name),
          registry: pkg.publishConfig?.registry ?? DEFAULT_REGISTRY,
        })
      } catch {
        // package.json missing or unreadable — skip silently.
      }
    }
  }
  // Stable order — alphabetical by name.
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Query the registry for `<name>` and return true iff `version` already
 * exists. We catch this BEFORE invoking `bun publish` so that packages
 * which were not bumped by changesets (because they had no pending
 * changeset of their own) don't crash the release run with a
 * `409 Conflict: Cannot publish over existing version`.
 *
 * Network / auth errors are treated as "unknown" — we let the publish
 * attempt proceed and surface any real failure there.
 */
async function isAlreadyPublished(pkg: DiscoveredPkg): Promise<boolean> {
  const encoded = pkg.name.replace('/', '%2F')
  const url = `${pkg.registry.replace(/\/$/, '')}/${encoded}`
  const token = process.env.BUN_AUTH_TOKEN ?? process.env.GITHUB_TOKEN
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  let res: Response
  try {
    res = await fetch(url, { headers })
  } catch (err) {
    console.warn(
      `  ⚠ registry lookup failed for ${pkg.name}: ${(err as Error).message} — will attempt publish`,
    )
    return false
  }
  if (res.status === 404) return false // package has never been published
  if (!res.ok) {
    console.warn(
      `  ⚠ registry returned ${res.status} for ${pkg.name} — will attempt publish`,
    )
    return false
  }
  const body = (await res.json().catch(() => ({}))) as {
    versions?: Record<string, unknown>
  }
  return Boolean(body.versions && pkg.version in body.versions)
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

  // Pre-flight: skip packages whose current `version` is already on the
  // registry. Without this, a release where some packages got bumped by
  // changesets and others didn't would crash with `409 Conflict` on the
  // unbumped ones.
  console.log('Checking registry for already-published versions…')
  const toPublish: DiscoveredPkg[] = []
  const skipped: DiscoveredPkg[] = []
  await Promise.all(
    pkgs.map(async (pkg) => {
      if (await isAlreadyPublished(pkg)) skipped.push(pkg)
      else toPublish.push(pkg)
    }),
  )
  skipped.sort((a, b) => a.name.localeCompare(b.name))
  toPublish.sort((a, b) => a.name.localeCompare(b.name))

  if (skipped.length > 0) {
    console.log(`\nSkipping ${skipped.length} already-published package(s):`)
    for (const p of skipped) console.log(`  ⏭ ${p.name}@${p.version}`)
  }
  console.log(`\nWill publish ${toPublish.length} package(s).\n`)

  const failures: { pkg: string; code: number }[] = []
  for (const pkg of toPublish) {
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
