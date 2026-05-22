#!/usr/bin/env bun
/**
 * Cross-platform replacement for `cp` used by package build scripts.
 *
 * Usage (relative to the package directory):
 *   bun ../../scripts/copy.ts <src> <dest>
 *
 * Copies a single file. Creates parent dirs of <dest> as needed.
 */
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const [src, dest] = process.argv.slice(2)
if (!src || !dest) {
  console.error('copy.ts: usage: copy.ts <src> <dest>')
  process.exit(1)
}

mkdirSync(dirname(dest), { recursive: true })
copyFileSync(src, dest)
