import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { VERSION } from '../src/index.js'

describe('VERSION', () => {
  test('matches the package manifest', async () => {
    const manifest = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { version: string }

    expect(VERSION).toBe(manifest.version)
  })
})
