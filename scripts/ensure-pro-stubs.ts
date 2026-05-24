#!/usr/bin/env bun
/**
 * Ensure the `pro-mirror/` workspace tree exists.
 *
 * Open-core's `package.json` lists four workspaces under `pro-mirror/`
 * (three Pro feature plugins + the Pro e2e harness). Locally these are
 * resolved through the gitignored `pro-mirror -> ../modern-admin-pro`
 * symlink. CI runners have no such symlink, so without intervention
 * `bun install` errors with `Workspace not found "pro-mirror/..."`.
 *
 * This script materialises a real `pro-mirror/` directory tree with
 * MINIMAL package.json stubs whose `name`, `version`, `dependencies`,
 * `devDependencies` and `peerDependencies` are read directly from the
 * committed `bun.lock`. With those stubs in place:
 *
 *   - `bun install --frozen-lockfile` succeeds (the workspace stanzas
 *     in the lock match the stub package.json contents).
 *   - `apps/api-prisma-pro` (which depends on `@modern-admin-pro/*`
 *     via `workspace:*`) resolves its deps.
 *   - The `changesets/action@v1` flow works end-to-end: even after the
 *     action's internal `git reset --hard <main>` (which discards
 *     tracked file mutations), the stubs remain because `pro-mirror/`
 *     is gitignored and untracked.
 *   - `bun install --lockfile-only` inside `version-packages` updates
 *     versions cleanly because stubs still resolve.
 *
 * IDEMPOTENT. The script is a no-op when:
 *   - `pro-mirror/` already exists with a populated probe package.json
 *     (local dev with the Pro repo checked out alongside, or a previous
 *     invocation in the same CI job already created the stubs).
 *
 * The stubs are NOT committed (`pro-mirror` is in `.gitignore`).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LOCK_PATH = resolve(REPO_ROOT, 'bun.lock')

type WorkspaceStanza = {
  name: string
  version: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

type Lockfile = {
  workspaces: Record<string, WorkspaceStanza>
}

/**
 * Parse bun.lock. The format is JSON with trailing commas, so plain
 * JSON.parse fails. Strip trailing commas before `}` / `]` first, then
 * parse. This handles every bun.lock we've seen so far.
 */
function parseLock(text: string): Lockfile {
  const cleaned = text.replace(/,(\s*[}\]])/g, '$1')
  return JSON.parse(cleaned) as Lockfile
}

function proAlreadyPopulated(): boolean {
  return existsSync(resolve(REPO_ROOT, 'pro-mirror/packages/feature-ai-fill/package.json'))
}

function writeStub(wsPath: string, stanza: WorkspaceStanza): void {
  const dir = resolve(REPO_ROOT, wsPath)
  mkdirSync(dir, { recursive: true })
  const pkg: Record<string, unknown> = {
    name: stanza.name,
    version: stanza.version,
    private: true,
  }
  if (stanza.dependencies) pkg.dependencies = stanza.dependencies
  if (stanza.devDependencies) pkg.devDependencies = stanza.devDependencies
  if (stanza.peerDependencies) pkg.peerDependencies = stanza.peerDependencies
  writeFileSync(resolve(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')
}

function main(): void {
  if (proAlreadyPopulated()) {
    console.log('[ensure-pro-stubs] pro-mirror already populated — nothing to do')
    return
  }
  console.log('[ensure-pro-stubs] pro-mirror missing — generating stubs from bun.lock')
  const lock = parseLock(readFileSync(LOCK_PATH, 'utf8'))
  const proPaths = Object.keys(lock.workspaces).filter((k) => k.startsWith('pro-mirror/'))
  if (proPaths.length === 0) {
    console.log('  no pro-mirror workspaces in bun.lock — nothing to do')
    return
  }
  for (const wsPath of proPaths) {
    const stanza = lock.workspaces[wsPath]
    writeStub(wsPath, stanza)
    console.log(`  ✓ ${wsPath} → stub ${stanza.name}@${stanza.version}`)
  }
  console.log(`[ensure-pro-stubs] created ${proPaths.length} stub(s)`)
}

main()
