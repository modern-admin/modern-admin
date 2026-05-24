#!/usr/bin/env bun
/**
 * Optional convenience: create a `pro-mirror` symlink pointing at a
 * sibling `modern-admin-pro` checkout, so pro-feature developers can
 * navigate / edit both repos from the open-core working tree.
 *
 * Open-core itself does NOT depend on `pro-mirror` for `bun install`,
 * typecheck, build, or release — the public workspaces only list
 * `apps/*` and `packages/*`. This script exists purely for local
 * developer ergonomics.
 *
 * Behaviour:
 *   - If `pro-mirror` already exists (any kind of entry) → no-op.
 *   - Else if `../modern-admin-pro` exists relative to the repo root →
 *     create the symlink `pro-mirror -> ../modern-admin-pro`.
 *   - Else → print instructions and exit non-zero so the user knows to
 *     clone the pro repo as a sibling first.
 *
 * Run via `bun run setup:pro`.
 */

import { existsSync, lstatSync, symlinkSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LINK_PATH = resolve(REPO_ROOT, 'pro-mirror')
const TARGET_REL = '../modern-admin-pro'
const TARGET_ABS = resolve(REPO_ROOT, '..', 'modern-admin-pro')

function existsAny(path: string): boolean {
  try {
    lstatSync(path)
    return true
  } catch {
    return false
  }
}

if (existsAny(LINK_PATH)) {
  console.log(`[setup-pro] pro-mirror already exists — nothing to do`)
  process.exit(0)
}

if (!existsSync(TARGET_ABS)) {
  console.error(`[setup-pro] ${TARGET_ABS} does not exist`)
  console.error(
    `\n  Clone the Pro repo as a sibling of modern-admin first:\n` +
      `    cd ${resolve(REPO_ROOT, '..')}\n` +
      `    git clone git@github.com:modern-admin/modern-admin-pro.git\n` +
      `    cd ${REPO_ROOT}\n` +
      `    bun run setup:pro\n`,
  )
  process.exit(1)
}

symlinkSync(TARGET_REL, LINK_PATH, 'dir')
console.log(`[setup-pro] created symlink pro-mirror -> ${TARGET_REL}`)
