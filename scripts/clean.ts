#!/usr/bin/env bun
/**
 * Cross-platform replacement for `rm -rf` used by package build scripts.
 *
 * Background: `bun run --filter` runs scripts with a sanitized PATH that
 * excludes /usr/bin and /bin, so `rm`, `cp`, etc. are not available. This
 * helper uses node:fs.rmSync, which works regardless of shell environment.
 *
 * Usage (relative to the package directory):
 *   bun ../../scripts/clean.ts <path1> [path2] ...
 */
import { rmSync } from 'node:fs'

const targets = process.argv.slice(2)
if (targets.length === 0) {
  console.error('clean.ts: no targets specified')
  process.exit(1)
}

for (const t of targets) {
  rmSync(t, { recursive: true, force: true })
}
