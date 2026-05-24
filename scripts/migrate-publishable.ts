#!/usr/bin/env bun
/**
 * One-shot migration script for the standard publishable packages.
 *
 * For each entry below it:
 *   1. Rewrites `<pkgDir>/package.json` to the published-package
 *      template (license, repository, files, publishConfig). Existing
 *      `dependencies` / `devDependencies` / `peerDependencies` etc. are
 *      preserved verbatim; `private`/`bin`/`engines` are carried over.
 *   2. Generates `<pkgDir>/tsconfig.build.json` (rootDir=src, outDir=dist)
 *      so `tsc -p tsconfig.build.json` emits a clean dist/ without the
 *      test sources.
 *   3. Overwrites `scripts.build` to use the new tsconfig and removes
 *      `private: true`.
 *
 * Packages with custom build pipelines (`packages/web` — Vite, dual
 * lib/standalone) and the metadata-only `packages/tsconfig` are handled
 * manually outside this script.
 *
 * `create-modern-admin` is deliberately excluded until Phase D, where it
 * will be renamed to `@modern-admin/create` and reshaped for the
 * standalone-service template.
 *
 * Run once:
 *   bun scripts/migrate-publishable.ts
 *
 * Idempotent — re-running yields the same output.
 */

import { readFile, writeFile, access } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPO_URL = 'https://github.com/modern-admin/modern-admin.git'
const REGISTRY = 'https://npm.pkg.github.com'
const VERSION = '0.1.0'

interface PkgEntry {
  dir: string
  /** Use the `react.json` tsconfig preset for tsx compilation. */
  reactPreset?: boolean
  description: string
}

interface PackageJson {
  name: string
  version: string
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, unknown>
  bin?: unknown
  engines?: unknown
  sideEffects?: unknown
  optionalDependencies?: Record<string, string>
  [k: string]: unknown
}

const PACKAGES: PkgEntry[] = [
  { dir: 'packages/core',
    description: 'Core abstractions of the Modern Admin framework — adapters, resources, decorators, actions, ports.' },
  { dir: 'packages/i18n',
    description: 'Translation registry and locale dictionaries for Modern Admin (9 locales).' },
  { dir: 'packages/queue',
    description: 'BullMQ-based queue + cron module for Modern Admin (NestJS).' },
  { dir: 'packages/ui',                reactPreset: true,
    description: 'i18n-unaware shadcn/ui-style React component library used by @modern-admin/react.' },
  { dir: 'packages/react',             reactPreset: true,
    description: 'React 19 frontend layer for Modern Admin — translation boundary, routing, hooks.' },
  { dir: 'packages/nest',
    description: 'NestJS module wrapping @modern-admin/core — REST controllers, guards, cache, OpenAPI.' },
  { dir: 'packages/graphql',
    description: 'Apollo + code-first GraphQL transport for @modern-admin/nest.' },
  { dir: 'packages/realtime',
    description: 'WebSocket gateway + realtime bus implementations for Modern Admin.' },
  { dir: 'packages/adapter-prisma',
    description: 'Prisma 7 adapter for Modern Admin — implements BaseDatabase/BaseResource on top of PrismaClient.' },
  { dir: 'packages/adapter-drizzle',
    description: 'Drizzle ORM adapter for Modern Admin — implements BaseDatabase/BaseResource on Drizzle schemas.' },
  { dir: 'packages/auth-better-auth',
    description: 'Better Auth provider integration for Modern Admin (cookie sessions + API keys).' },
  { dir: 'packages/cache-redis',
    description: 'Redis cache + pub/sub invalidation provider for Modern Admin.' },
  { dir: 'packages/system-prisma',
    description: 'Prisma-backed implementation of Modern Admin system stores (logs, history, webhooks, AI tasks).' },
  { dir: 'packages/system-drizzle',
    description: 'Drizzle-backed implementation of Modern Admin system stores.' },
  { dir: 'packages/feature-history',
    description: 'Record revision history feature plugin for Modern Admin.' },
  { dir: 'packages/feature-json-by-key',
    description: 'Editable JSON-by-key property type for Modern Admin.' },
  { dir: 'packages/feature-m2m',
    description: 'Many-to-many relation property type for Modern Admin.' },
  { dir: 'packages/feature-password',
    description: 'Hashed password property type for Modern Admin.' },
  { dir: 'packages/feature-upload',
    description: 'File upload feature plugin for Modern Admin (local + S3 providers).' },
]

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await writeFile(file, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

function buildPackageJson(entry: PkgEntry, existing: PackageJson): PackageJson {
  // Layered template: ordered top-level for diff readability, deps and
  // peers preserved from existing.
  const scripts: Record<string, string> = { ...existing.scripts }
  scripts.build = 'rm -rf dist && tsc -p tsconfig.build.json'
  scripts.typecheck = 'tsc --noEmit'

  const next: PackageJson = {
    name: existing.name,
    version: VERSION,
    description: entry.description,
    type: 'module',
    license: 'MIT',
    repository: {
      type: 'git',
      url: REPO_URL,
      directory: entry.dir,
    },
    main: './src/index.ts',
    types: './src/index.ts',
    exports: {
      '.': {
        types: './src/index.ts',
        default: './src/index.ts',
      },
    },
    files: ['dist', 'src'],
    publishConfig: {
      registry: REGISTRY,
      access: 'restricted',
      main: './dist/index.js',
      types: './dist/index.d.ts',
      exports: {
        '.': {
          types: './dist/index.d.ts',
          default: './dist/index.js',
        },
      },
    },
    scripts,
  }

  for (const key of [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'peerDependenciesMeta',
    'optionalDependencies',
    'bin',
    'engines',
    'sideEffects',
  ] as const) {
    if (existing[key] !== undefined) {
      ;(next as Record<string, unknown>)[key] = existing[key]
    }
  }

  return next
}

function buildTsconfigBuild(entry: PkgEntry): unknown {
  return {
    $schema: 'https://json.schemastore.org/tsconfig',
    extends: entry.reactPreset
      ? '@modern-admin/tsconfig/react.json'
      : '@modern-admin/tsconfig/node.json',
    compilerOptions: {
      rootDir: './src',
      outDir: './dist',
      noEmit: false,
      tsBuildInfoFile: './.tsbuildinfo',
    },
    include: ['src/**/*'],
  }
}

async function migrate(entry: PkgEntry): Promise<void> {
  const pkgDir = join(REPO_ROOT, entry.dir)
  const pkgJsonPath = join(pkgDir, 'package.json')
  if (!(await exists(pkgJsonPath))) {
    console.warn(`  ! ${entry.dir} — package.json missing, skipping`)
    return
  }
  const existing = await readJson<PackageJson>(pkgJsonPath)
  const next = buildPackageJson(entry, existing)
  await writeJson(pkgJsonPath, next)
  console.log(`  ✓ ${entry.dir} — package.json updated (${next.name})`)

  const tsconfigBuildPath = join(pkgDir, 'tsconfig.build.json')
  if (!(await exists(tsconfigBuildPath))) {
    await writeJson(tsconfigBuildPath, buildTsconfigBuild(entry))
    console.log(`     + tsconfig.build.json`)
  }
}

async function main(): Promise<void> {
  console.log('Migrating publishable packages to published-package template...')
  for (const entry of PACKAGES) {
    await migrate(entry)
  }
  console.log('Done.')
}

await main()
