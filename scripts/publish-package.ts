#!/usr/bin/env bun
/**
 * Publishes ONE workspace package to its configured registry.
 *
 * Why this exists:
 *
 *   `bun publish` does not currently honour `publishConfig.{main,types,exports}`
 *   overrides — it ships the top-level fields as-is. Our packages keep
 *   `main`/`exports` pointing at `./src/*.ts` so dev inside the monorepo
 *   works without a prior build step. For publication those paths must
 *   point at the compiled `./dist/*.js` output.
 *
 * What this script does:
 *
 *   1. Reads `<pkgDir>/package.json`.
 *   2. Builds the package (`bun run build` inside the package).
 *   3. Writes a transformed `package.json` where `publishConfig.{main,
 *      types,exports}` are merged into the top-level fields, the
 *      now-redundant `scripts` block is dropped, and the original is
 *      stashed in memory.
 *   4. Runs `bun publish` with the chosen registry/tag/access settings.
 *   5. Restores the original `package.json` in a `finally` block so the
 *      working tree is always clean (even on failure).
 *
 * Usage:
 *
 *   bun scripts/publish-package.ts packages/core            # publish
 *   bun scripts/publish-package.ts packages/core --dry-run  # pack only
 *   bun scripts/publish-package.ts packages/core --tag next
 *
 * Auth: requires `BUN_AUTH_TOKEN` (or a `.npmrc` with the right line) so
 * `bun publish` can authenticate against the registry. In GitHub Actions
 * the workflow exports `GITHUB_TOKEN` → `BUN_AUTH_TOKEN`.
 */

import { readFile, writeFile, readdir, rm, copyFile, access } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

interface PackageJson {
  name: string
  version: string
  main?: string
  types?: string
  exports?: unknown
  bin?: unknown
  scripts?: Record<string, string>
  publishConfig?: {
    registry?: string
    access?: string
    tag?: string
    main?: string
    types?: string
    exports?: unknown
    bin?: unknown
  }
  [k: string]: unknown
}

function parseArgs(argv: string[]): { pkgDir: string; dryRun: boolean; tag?: string } {
  const positional = argv.filter((a) => !a.startsWith('--'))
  const flags = argv.filter((a) => a.startsWith('--'))
  const pkgDir = positional[0]
  if (!pkgDir) {
    console.error('Usage: bun scripts/publish-package.ts <pkgDir> [--dry-run] [--tag <tag>]')
    process.exit(2)
  }
  const dryRun = flags.includes('--dry-run')
  const tagIdx = flags.indexOf('--tag')
  const tag = tagIdx >= 0 ? argv[argv.indexOf('--tag') + 1] : undefined
  return { pkgDir: resolve(pkgDir), dryRun, tag }
}

async function readJson<T>(file: string): Promise<T> {
  const raw = await readFile(file, 'utf8')
  return JSON.parse(raw) as T
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await writeFile(file, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

function applyPublishOverrides(pkg: PackageJson): PackageJson {
  const out: PackageJson = { ...pkg }
  const overrides = pkg.publishConfig
  if (!overrides) return out
  if (overrides.main !== undefined) out.main = overrides.main
  if (overrides.types !== undefined) out.types = overrides.types
  if (overrides.exports !== undefined) out.exports = overrides.exports
  if (overrides.bin !== undefined) out.bin = overrides.bin
  // Strip dev-only scripts from the published package.json. `bun publish`
  // would run `prepublishOnly` etc. — we already built upfront.
  delete out.scripts
  return out
}

/**
 * Ensure the package directory carries a LICENSE file at publish time.
 *
 * The monorepo keeps a single root `LICENSE`; individual packages don't ship
 * their own copy, so `bun publish` (which auto-includes `LICENSE*`) uploads
 * tarballs with no license text. We stage the root LICENSE into the package
 * for the duration of the publish and remove it afterwards. If the package
 * already has its own LICENSE we leave it untouched.
 *
 * Returns a cleanup callback that removes the file only when we created it.
 */
async function stageLicense(pkgDir: string): Promise<() => Promise<void>> {
  const dest = join(pkgDir, 'LICENSE')
  try {
    await access(dest)
    return async () => {} // package ships its own LICENSE — leave it be.
  } catch {
    /* no LICENSE in the package — stage the root one below. */
  }
  const src = join(REPO_ROOT, 'LICENSE')
  await copyFile(src, dest)
  console.log('  → staged root LICENSE into package')
  return async () => {
    await rm(dest, { force: true })
  }
}

/** Resolve `bun` reliably whether or not it's on PATH inside the spawn env. */
const BUN_BIN = process.execPath

/** Current version of every workspace package, by package name. */
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
        ) as { name?: string; version?: string }
        if (pkg.name && pkg.version) versions.set(pkg.name, pkg.version)
      } catch {
        /* skip */
      }
    }
  }
  return versions
}

/**
 * Guard against shipping stale internal dependency ranges.
 *
 * `bun publish` substitutes `workspace:^` ranges from **bun.lock**, whose
 * workspace versions bun does not refresh after `changeset version` — that
 * is how `@modern-admin/*@0.2.0` shipped pinning `core@0.1.1` and crashed
 * consumers with nested-copy resolution. We pack the tarball first, read
 * the manifest it would publish, and require every `@modern-admin/*`
 * range to be `^<current workspace version>` (no `workspace:` remnants,
 * no stale numbers). Any mismatch aborts the publish.
 */
async function verifyPackedInternalDeps(pkgDir: string, pkg: PackageJson): Promise<void> {
  console.log('  → bun pm pack (verify internal dependency ranges)')
  run(['pm', 'pack', '--quiet'], pkgDir)
  const tarball = join(
    pkgDir,
    `${pkg.name.replace('@', '').replace('/', '-')}-${pkg.version}.tgz`,
  )
  try {
    const r = spawnSync('tar', ['-xzOf', tarball, 'package/package.json'], {
      encoding: 'utf8',
    })
    if (r.status !== 0) throw new Error(`tar failed: ${r.stderr}`)
    const packed = JSON.parse(r.stdout) as PackageJson
    const versions = await workspaceVersions()
    const problems: string[] = []
    for (const key of ['dependencies', 'peerDependencies', 'optionalDependencies'] as const) {
      const deps = (packed[key] ?? {}) as Record<string, string>
      for (const [name, range] of Object.entries(deps)) {
        if (!name.startsWith('@modern-admin/')) continue
        const expected = `^${versions.get(name)}`
        if (range !== expected) {
          problems.push(`${key}.${name} = "${range}" (expected "${expected}")`)
        }
      }
    }
    if (problems.length > 0) {
      throw new Error(
        `Packed manifest of ${pkg.name}@${pkg.version} carries wrong internal ranges:\n` +
          problems.map((p) => `    ✗ ${p}`).join('\n') +
          '\n  Likely a stale bun.lock — run `bun scripts/sync-lock-workspace-versions.ts` and retry.',
      )
    }
    console.log('  ✓ internal dependency ranges verified')
  } finally {
    await rm(tarball, { force: true })
  }
}

function run(args: string[], cwd: string): void {
  const r = spawnSync(BUN_BIN, args, { cwd, stdio: 'inherit', env: process.env })
  if (r.status !== 0) {
    throw new Error(`bun ${args.join(' ')} exited with code ${r.status ?? 'signal:' + r.signal}`)
  }
}

async function main(): Promise<void> {
  const { pkgDir, dryRun, tag } = parseArgs(process.argv.slice(2))
  const pkgJsonPath = join(pkgDir, 'package.json')

  const original = await readFile(pkgJsonPath, 'utf8')
  const pkg = JSON.parse(original) as PackageJson

  if (!pkg.name) throw new Error(`Missing "name" in ${pkgJsonPath}`)
  console.log(`▶ Publishing ${pkg.name}@${pkg.version} from ${pkgDir}`)

  // Build first — fail fast before touching package.json.
  if (pkg.scripts?.build) {
    console.log('  → bun run build')
    run(['run', 'build'], pkgDir)
  }

  const transformed = applyPublishOverrides(pkg)
  await writeJson(pkgJsonPath, transformed)
  const cleanupLicense = await stageLicense(pkgDir)

  try {
    await verifyPackedInternalDeps(pkgDir, transformed)
    // `bun publish --dry-run` still performs the registry auth handshake,
    // which makes local smoke-testing without a token impossible. Route
    // dry-runs through `bun pm pack --dry-run` instead — it operates on
    // the same `files`/manifest rules but never contacts the registry.
    const args = dryRun
      ? ['pm', 'pack', '--dry-run']
      : ['publish']
    if (!dryRun && tag) args.push('--tag', tag)
    if (!dryRun && transformed.publishConfig?.access) {
      args.push('--access', transformed.publishConfig.access)
    }
    console.log(`  → bun ${args.join(' ')}`)
    run(args, pkgDir)
  } finally {
    await cleanupLicense()
    await writeFile(pkgJsonPath, original, 'utf8')
    console.log(`  ↩ restored original ${pkgJsonPath}`)
  }
}

await main()
