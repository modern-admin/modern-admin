import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  appendPrismaModels,
  generate,
  listPrismaModels,
  parsePrismaModels,
} from '../src/generate.js'

const CANONICAL = `// Modern Admin — system tables (Prisma fragment)
//
// Some intro comment.

/// Doc comment for MaRole.
model MaRole {
  id String @id

  @@map("ma_role")
}

model MaLog {
  id String @id @default(uuid())

  @@map("ma_log")
}

model MaCache {
  key String @id

  @@map("ma_cache")
}
`

describe('parsePrismaModels', () => {
  test('extracts every top-level model with its leading comments', () => {
    const blocks = parsePrismaModels(CANONICAL)
    expect(blocks.map((b) => b.name)).toEqual(['MaRole', 'MaLog', 'MaCache'])
    // Doc comment is captured.
    expect(blocks[0]!.text).toContain('/// Doc comment for MaRole.')
    expect(blocks[0]!.text).toContain('model MaRole {')
    expect(blocks[0]!.text).toContain('@@map("ma_role")')
  })

  test('returns empty list when no models declared', () => {
    expect(parsePrismaModels('// just a comment\n')).toEqual([])
  })
})

describe('listPrismaModels', () => {
  test('returns the set of declared model names', () => {
    const set = listPrismaModels(CANONICAL)
    expect([...set].sort()).toEqual(['MaCache', 'MaLog', 'MaRole'])
  })
})

describe('appendPrismaModels', () => {
  test('appends only models missing from the host schema', () => {
    const host = `model MaRole {\n  id String @id\n}\n`
    const { output, added, skipped } = appendPrismaModels(host, CANONICAL)
    expect(added).toEqual(['MaLog', 'MaCache'])
    expect(skipped).toEqual(['MaRole'])
    expect(output).toContain('model MaRole')
    expect(output).toContain('model MaLog')
    expect(output).toContain('model MaCache')
    // Original block is not duplicated.
    expect(output.match(/model MaRole/g)?.length).toBe(1)
  })

  test('is a no-op when every canonical model is present', () => {
    const host = `model MaRole { id String @id }\nmodel MaLog { id String @id }\nmodel MaCache { key String @id }\n`
    const result = appendPrismaModels(host, CANONICAL)
    expect(result.added).toEqual([])
    expect(result.skipped).toEqual(['MaRole', 'MaLog', 'MaCache'])
    expect(result.output).toBe(host)
  })

  test('re-running keeps the file stable (idempotency)', () => {
    const host = ''
    const first = appendPrismaModels(host, CANONICAL)
    const second = appendPrismaModels(first.output, CANONICAL)
    expect(second.added).toEqual([])
    expect(second.output).toBe(first.output)
  })
})

describe('generate (filesystem)', () => {
  let cwd: string

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), 'generate-test-'))
  })

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true })
  })

  test('Prisma — patches schema.prisma in place', async () => {
    await mkdir(join(cwd, 'prisma'), { recursive: true })
    const initial = `generator client {\n  provider = "prisma-client-js"\n}\n\nmodel MaRole {\n  id String @id\n}\n`
    await writeFile(join(cwd, 'prisma/schema.prisma'), initial, 'utf8')

    const result = await generate({ cwd, orm: 'prisma' })
    expect(result.orm).toBe('prisma')
    expect(result.added).toContain('MaUser')
    expect(result.added).toContain('MaLog')
    expect(result.skipped).toContain('MaRole')

    const written = await readFile(join(cwd, 'prisma/schema.prisma'), 'utf8')
    expect(written).toContain('model MaUser')
    expect(written).toContain('model MaLog')
    // Existing model body preserved.
    expect(written).toContain('model MaRole {\n  id String @id\n}')
  })

  test('Prisma — dry-run does not write', async () => {
    await mkdir(join(cwd, 'prisma'), { recursive: true })
    const initial = ''
    await writeFile(join(cwd, 'prisma/schema.prisma'), initial, 'utf8')

    const result = await generate({ cwd, orm: 'prisma', dryRun: true })
    expect(result.added.length).toBeGreaterThan(0)

    const written = await readFile(join(cwd, 'prisma/schema.prisma'), 'utf8')
    expect(written).toBe(initial)
  })

  test('Prisma — re-running is a no-op', async () => {
    await mkdir(join(cwd, 'prisma'), { recursive: true })
    await writeFile(join(cwd, 'prisma/schema.prisma'), '', 'utf8')

    await generate({ cwd, orm: 'prisma' })
    const after1 = await readFile(join(cwd, 'prisma/schema.prisma'), 'utf8')

    const second = await generate({ cwd, orm: 'prisma' })
    expect(second.added).toEqual([])
    const after2 = await readFile(join(cwd, 'prisma/schema.prisma'), 'utf8')
    expect(after2).toBe(after1)
  })

  test('Drizzle — writes a re-export file', async () => {
    const result = await generate({ cwd, orm: 'drizzle' })
    expect(result.orm).toBe('drizzle')
    expect(result.added).toEqual(['modern-admin-schema.ts'])

    const content = await readFile(result.schemaPath, 'utf8')
    expect(content).toContain("export * from '@modern-admin/system-drizzle/pg'")
    expect(content).toContain('AUTO-GENERATED')
  })

  test('Drizzle — re-run is a no-op when content is unchanged', async () => {
    await generate({ cwd, orm: 'drizzle' })
    const second = await generate({ cwd, orm: 'drizzle' })
    expect(second.added).toEqual([])
    expect(second.skipped).toEqual(['modern-admin-schema.ts'])
  })

  test('auto-detect picks Prisma when prisma/schema.prisma exists', async () => {
    await mkdir(join(cwd, 'prisma'), { recursive: true })
    await writeFile(join(cwd, 'prisma/schema.prisma'), '', 'utf8')
    const result = await generate({ cwd })
    expect(result.orm).toBe('prisma')
  })

  test('auto-detect picks Drizzle when drizzle.config.ts exists', async () => {
    await writeFile(join(cwd, 'drizzle.config.ts'), 'export default {}', 'utf8')
    const result = await generate({ cwd })
    expect(result.orm).toBe('drizzle')
  })

  test('auto-detect throws when neither marker is present', async () => {
    await expect(generate({ cwd })).rejects.toThrow(/auto-detect/)
  })
})
