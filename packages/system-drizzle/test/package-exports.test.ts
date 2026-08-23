import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { maUser, systemTables } from '@modern-admin/system-drizzle/pg'

interface ExportTarget {
  types: string
  default: string
}

interface PackageManifest {
  exports: Record<string, ExportTarget>
  publishConfig: {
    exports: Record<string, ExportTarget>
  }
}

const packageDir = join(import.meta.dir, '..')

describe('package exports', () => {
  test('resolves the PostgreSQL schema subpath in the workspace', () => {
    expect(systemTables.maUser).toBe(maUser)
  })

  test('exposes the PostgreSQL schema in workspace and published manifests', async () => {
    const manifest = JSON.parse(
      await readFile(join(packageDir, 'package.json'), 'utf8'),
    ) as PackageManifest

    expect(manifest.exports['./pg']).toEqual({
      types: './src/schema/pg.ts',
      default: './src/schema/pg.ts',
    })
    expect(manifest.publishConfig.exports['./pg']).toEqual({
      types: './dist/schema/pg.d.ts',
      default: './dist/schema/pg.js',
    })
  })
})
