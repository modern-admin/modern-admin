// Release guard: generated dependencies must match their individual workspace
// versions, including releases where the CLI and framework patches differ.
import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { frameworkVersionVariables, readOwnVersion, scaffold } from '../src/scaffold.js'

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
  test('ships the Better Auth 1.7 account identity schema and seed tuple', async () => {
    const schema = await readFile(join(templateDir, 'prisma/schema.prisma'), 'utf8')
    const readme = await readFile(join(templateDir, 'README.md'), 'utf8')
    expect(schema).toMatch(/model MaAccount \{[\s\S]*?issuer\s+String/)
    expect(schema).toContain('@@unique([issuer, accountId])')
    expect(schema).toContain('@@index([userId])')
    expect(readme).toContain("providerId: 'credential'")
    expect(readme).toContain("issuer: 'local:credential'")
    expect(readme).toContain('accountId: user.id')
    expect(readme).toContain("import { hashPassword } from 'better-auth/crypto'")
  })

  test('template pins every @modern-admin/* dep to its own version token', async () => {
    const raw = await readFile(join(templateDir, 'package.json'), 'utf8')
    const deps = modernAdminDeps(JSON.parse(raw))
    expect(Object.keys(deps).length).toBeGreaterThan(0)
    for (const [name, range] of Object.entries(deps)) {
      const token = `${name.slice('@modern-admin/'.length).replaceAll('-', '_')}_version`
      expect(`${name}: ${range}`).toBe(`${name}: ^{{${token}}}`)
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

    test('CLI uses each framework package release version, including mixed patch versions', async () => {
      const child = Bun.spawnSync(
        [
          process.execPath,
          join(packageDir, 'src/cli.ts'),
          'mixed-version-app',
          '--target',
          targetDir,
        ],
        { stdout: 'pipe', stderr: 'pipe' },
      )
      expect(child.exitCode, child.stderr.toString()).toBe(0)
      const generated = JSON.parse(await readFile(join(targetDir, 'package.json'), 'utf8'))
      for (const [name, range] of Object.entries(modernAdminDeps(generated))) {
        const manifest = JSON.parse(
          await readFile(
            join(packageDir, '..', name.slice('@modern-admin/'.length), 'package.json'),
            'utf8',
          ),
        )
        expect(`${name}: ${range}`).toBe(`${name}: ^${manifest.version}`)
      }
    })

    test('substitutes every framework version token', async () => {
      await scaffold({
        name: 'demo-app',
        templateDir,
        targetDir,
        variables: frameworkVersionVariables(),
      })
      const raw = await readFile(join(targetDir, 'package.json'), 'utf8')
      expect(raw).not.toInclude('{{')
      const deps = modernAdminDeps(JSON.parse(raw))
      expect(Object.keys(deps).length).toBeGreaterThan(0)
      expect(Object.values(deps).every((range) => /^\^\d+\.\d+\.\d+$/.test(range))).toBe(true)
    })

    test('Prisma CLI loads the generated config and validates the schema without a database', async () => {
      await scaffold({
        name: 'prisma-config-test',
        templateDir,
        targetDir,
        variables: frameworkVersionVariables(),
      })
      await symlink(join(packageDir, 'node_modules'), join(targetDir, 'node_modules'), 'dir')
      const child = Bun.spawn(
        [process.execPath, Bun.resolveSync('prisma/build/index.js', packageDir), 'validate'],
        {
          cwd: targetDir,
          env: { ...process.env, DATABASE_URL: 'postgresql://localhost:1/schema_contract' },
          stdout: 'pipe',
          stderr: 'pipe',
        },
      )
      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ])
      expect(exitCode, stdout + stderr).toBe(0)
      expect(stderr).toContain('Loaded Prisma config from prisma.config.ts')
    })
  })
})
