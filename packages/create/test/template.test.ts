// Release guard for the scaffold template: every @modern-admin/* dependency
// in template/package.json must carry the `^{{modernAdminVersion}}` token
// (never a hardcoded version), and scaffolding must substitute the CLI's own
// package.json version — so `bun create @modern-admin` always pins the
// release line that was just published, not a stale one.
import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readOwnVersion, scaffold } from '../src/scaffold.js'

const packageDir = join(import.meta.dir, '..')
const templateDir = join(packageDir, 'template')

const modernAdminDeps = (pkg: {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}): Record<string, string> =>
  Object.fromEntries(
    Object.entries({ ...pkg.dependencies, ...pkg.devDependencies }).filter(([name]) =>
      name.startsWith('@modern-admin/'),
    ),
  )

describe('scaffold template versions', () => {
  test('template pins every @modern-admin/* dep to the version token', async () => {
    const raw = await readFile(join(templateDir, 'package.json'), 'utf8')
    const deps = modernAdminDeps(JSON.parse(raw))
    expect(Object.keys(deps).length).toBeGreaterThan(0)
    for (const [name, range] of Object.entries(deps)) {
      expect(`${name}: ${range}`).toBe(`${name}: ^{{modernAdminVersion}}`)
    }
  })

  test('readOwnVersion returns the CLI package version', async () => {
    const raw = await readFile(join(packageDir, 'package.json'), 'utf8')
    const expected = (JSON.parse(raw) as { version: string }).version
    expect(await readOwnVersion(packageDir)).toBe(expected)
  })

  describe('scaffolded output', () => {
    let targetDir: string

    beforeEach(async () => {
      targetDir = await mkdtemp(join(tmpdir(), 'modern-admin-create-'))
    })

    afterEach(async () => {
      await rm(targetDir, { recursive: true, force: true })
    })

    test('pins @modern-admin/* deps to the CLI release line, no tokens left', async () => {
      const version = await readOwnVersion(packageDir)
      await scaffold({
        name: 'demo-app',
        templateDir,
        targetDir,
        variables: { modernAdminVersion: version },
      })
      const raw = await readFile(join(targetDir, 'package.json'), 'utf8')
      expect(raw).not.toInclude('{{')
      const deps = modernAdminDeps(JSON.parse(raw))
      expect(Object.keys(deps).length).toBeGreaterThan(0)
      for (const range of Object.values(deps)) {
        expect(range).toBe(`^${version}`)
      }
    })
  })
})
