import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const packageDir = join(import.meta.dir, '..')

describe('Better Auth 1.7 account identity assets', () => {
  test('canonical Prisma model uses the stable identity pair and user index', async () => {
    const schema = await readFile(join(packageDir, 'prisma/modern-admin.prisma'), 'utf8')
    expect(schema).toMatch(/model MaAccount \{[\s\S]*?issuer\s+String/)
    expect(schema).toContain('@@unique([issuer, accountId])')
    expect(schema).toContain('@@index([userId])')
  })

  test('migration backfills before NOT NULL and fails closed on unsafe data', async () => {
    const migration = await readFile(
      join(packageDir, 'prisma/migrations/better-auth-1.7-account-identities.sql'),
      'utf8',
    )
    const addNullable = migration.indexOf('ADD COLUMN "issuer" TEXT;')
    const backfill = migration.indexOf('UPDATE "ma_account"')
    const setNotNull = migration.indexOf('ALTER COLUMN "issuer" SET NOT NULL')
    expect(addNullable).toBeGreaterThan(-1)
    expect(backfill).toBeGreaterThan(addNullable)
    expect(setNotNull).toBeGreaterThan(backfill)
    expect(migration).toContain("WHEN 'credential' THEN 'local:credential'")
    expect(migration).toContain("WHEN 'google' THEN 'https://accounts.google.com'")
    expect(migration).toContain("WHEN 'github' THEN 'local:oauth:github'")
    expect(migration).toContain('unknown account providers')
    expect(migration).toContain('duplicate (issuer, accountId) identities')
    expect(migration).toContain('BEGIN;')
    expect(migration).toContain('COMMIT;')
  })
})
