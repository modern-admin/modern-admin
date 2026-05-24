#!/usr/bin/env bun
/**
 * CI-side lockfile sanitizer.
 *
 * Open-core's `package.json` lists `pro-mirror/packages/*` and
 * `pro-mirror/apps/*` as workspaces so that local developers with the
 * sibling `modern-admin-pro` repo checked out alongside (via the
 * gitignored `pro-mirror` symlink) get a unified node_modules tree —
 * the Pro feature plugins, the Pro demo app, and the Pro e2e harness
 * all install from one `bun install` at the open-core root.
 *
 * CI runners do NOT have that symlink, so resolving those workspace
 * paths fails with `Workspace not found`. Additionally, `apps/api-prisma-pro`
 * (which IS in open-core) depends on `@modern-admin-pro/feature-*`
 * workspaces via `workspace:*`, so it cannot be installed without the
 * Pro repo alongside either.
 *
 * This script runs BEFORE `bun install --frozen-lockfile` in CI and
 * transforms `package.json` + `bun.lock` so that:
 *
 *   - `pro-mirror/*` workspace globs are dropped from `package.json`.
 *   - `apps/api-prisma-pro` is excluded via a `!` negation pattern.
 *   - All matching workspace stanzas and `@modern-admin-pro/*`
 *     resolution-map entries are removed from `bun.lock`.
 *   - Any duplicate workspace stanza keys are deduplicated (defends
 *     against historical lockfile drift).
 *
 * When `pro-mirror` IS present and populated, the script is mostly a
 * no-op (it still dedupes lockfile keys for hygiene, but does not
 * touch Pro entries).
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PKG_PATH = resolve(REPO_ROOT, 'package.json')
const LOCK_PATH = resolve(REPO_ROOT, 'bun.lock')

/** True iff `pro-mirror` resolves to a directory containing the expected Pro packages. */
function proAvailable(): boolean {
  const probe = resolve(REPO_ROOT, 'pro-mirror/packages/feature-ai-fill/package.json')
  return existsSync(probe)
}

/**
 * Remove all occurrences of a top-level workspace stanza from the
 * lockfile text. A stanza looks like:
 *
 *     "<key>": {
 *       ...nested...
 *     },
 *
 * keyed at the 4-space indentation level (inside the top-level
 * `workspaces` object). Returns the number of stanzas removed.
 */
function removeWorkspaceStanza(text: string, key: string): { text: string; count: number } {
  const open = `    "${key}": {`
  let count = 0
  for (;;) {
    const idx = text.indexOf(open)
    if (idx === -1) break
    // Walk forward from just after the opening `{`, counting brace depth.
    let depth = 1
    let i = idx + open.length
    while (i < text.length && depth > 0) {
      const c = text[i]
      if (c === '{') depth++
      else if (c === '}') depth--
      i++
    }
    // `i` now points to the character right after the matching `}`.
    // Consume an optional trailing `,` and `\n` so the surrounding
    // structure stays well-formed.
    let end = i
    if (text[end] === ',') end++
    if (text[end] === '\n') end++
    text = text.slice(0, idx) + text.slice(end)
    count++
  }
  return { text, count }
}

/**
 * Remove single-line resolution-map entries for any `@modern-admin-pro/*`
 * package. Each entry looks like:
 *
 *     "@modern-admin-pro/foo": ["@modern-admin-pro/foo@workspace:..."],
 *
 * followed by an optional blank separator line.
 */
function stripProResolutions(text: string): { text: string; removed: number } {
  const re = /^ {4}"@modern-admin-pro\/[^"]+": \[[^\]]+\],\n(?:\n)?/gm
  const matches = text.match(re)
  const removed = matches ? matches.length : 0
  text = text.replace(re, '')
  return { text, removed }
}

/**
 * Defensive dedupe: if any top-level workspace key appears more than
 * once (which has happened historically due to lockfile merge drift),
 * keep only the FIRST occurrence and drop the rest. Returns the number
 * of duplicate stanzas removed.
 */
function dedupeWorkspaceKeys(text: string): { text: string; dropped: number } {
  // Scan the `workspaces` object for top-level keys (4-space indent).
  // Collect their positions, then remove duplicates.
  const seen = new Set<string>()
  const dupes: string[] = []
  const re = /^ {4}"([^"]+)": \{$/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const key = m[1]
    if (seen.has(key)) dupes.push(key)
    else seen.add(key)
  }
  let dropped = 0
  for (const key of new Set(dupes)) {
    // Remove only the EXTRA occurrences — find all, keep first.
    const open = `    "${key}": {`
    let firstIdx = text.indexOf(open)
    if (firstIdx === -1) continue
    // Repeatedly remove subsequent matches.
    for (;;) {
      const idx = text.indexOf(open, firstIdx + open.length)
      if (idx === -1) break
      let depth = 1
      let i = idx + open.length
      while (i < text.length && depth > 0) {
        const c = text[i]
        if (c === '{') depth++
        else if (c === '}') depth--
        i++
      }
      let end = i
      if (text[end] === ',') end++
      if (text[end] === '\n') end++
      text = text.slice(0, idx) + text.slice(end)
      dropped++
    }
  }
  return { text, dropped }
}

function main(): void {
  const hasPro = proAvailable()
  console.log(`[ci-strip-pro] pro-mirror ${hasPro ? 'AVAILABLE' : 'MISSING'}`)

  // --- bun.lock: always dedupe; only strip Pro when pro-mirror missing.
  let lock = readFileSync(LOCK_PATH, 'utf8')
  const original = lock

  const deduped = dedupeWorkspaceKeys(lock)
  lock = deduped.text
  if (deduped.dropped > 0) {
    console.log(`  bun.lock: dropped ${deduped.dropped} duplicate workspace stanza(s)`)
  }

  if (!hasPro) {
    const workspaceKeysToRemove = [
      'apps/api-prisma-pro',
      'pro-mirror/apps/e2e',
      'pro-mirror/packages/feature-ai-fill',
      'pro-mirror/packages/feature-logging',
      'pro-mirror/packages/feature-webhooks',
    ]
    let totalRemoved = 0
    for (const key of workspaceKeysToRemove) {
      const r = removeWorkspaceStanza(lock, key)
      lock = r.text
      if (r.count > 0) {
        console.log(`  bun.lock: removed workspace "${key}" (×${r.count})`)
        totalRemoved += r.count
      }
    }
    const res = stripProResolutions(lock)
    lock = res.text
    if (res.removed > 0) {
      console.log(`  bun.lock: removed ${res.removed} @modern-admin-pro/* resolution(s)`)
    }
    if (totalRemoved === 0 && res.removed === 0) {
      console.log('  bun.lock: no Pro references found (already clean)')
    }
  }

  if (lock !== original) {
    writeFileSync(LOCK_PATH, lock)
    console.log('  bun.lock: written')
  } else {
    console.log('  bun.lock: unchanged')
  }

  // --- package.json: only edit when pro-mirror missing.
  if (!hasPro) {
    const pkgText = readFileSync(PKG_PATH, 'utf8')
    const pkg = JSON.parse(pkgText) as { workspaces: string[] }
    const before = pkg.workspaces.length
    pkg.workspaces = pkg.workspaces.filter((w) => !w.startsWith('pro-mirror/'))
    if (!pkg.workspaces.includes('!apps/api-prisma-pro')) {
      pkg.workspaces.push('!apps/api-prisma-pro')
    }
    const after = pkg.workspaces.length
    if (before !== after || !pkg.workspaces.includes('!apps/api-prisma-pro')) {
      writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n')
      console.log(`  package.json: workspaces ${before} → ${after}`)
    } else {
      console.log('  package.json: unchanged')
    }
  } else {
    console.log('  package.json: unchanged (pro-mirror present)')
  }

  console.log('[ci-strip-pro] done')
}

main()
