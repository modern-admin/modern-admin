import { describe, it, expect, afterEach } from 'bun:test'
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isUnsafeKey, sanitizeFilename, resolveWithinDir } from '../src/path-safety.js'
import { LocalUploadProvider } from '../src/providers/local.js'
import type { UploadedFile } from '../src/types.js'

const file = (name: string): UploadedFile => ({
  originalName: name,
  mimeType: 'application/octet-stream',
  size: 3,
  buffer: Buffer.from('abc'),
})

describe('isUnsafeKey', () => {
  it('rejects traversal, absolute, NUL and empty keys', () => {
    for (const k of [
      '',
      '..',
      '../evil',
      'a/../../evil',
      '../../../../app/src/main.ts',
      '..\\..\\evil',
      '/etc/passwd',
      'C:\\Windows\\x',
      'a\0b',
    ]) {
      expect(isUnsafeKey(k)).toBe(true)
    }
    expect(isUnsafeKey(42)).toBe(true)
  })

  it('allows normal keys including nested prefixes', () => {
    for (const k of ['uuid.jpg', 'avatars/2024/01/uuid.jpg', 'a.b.c.png', 'x/y/z']) {
      expect(isUnsafeKey(k)).toBe(false)
    }
  })
})

describe('sanitizeFilename', () => {
  it('strips directory components and traversal', () => {
    expect(sanitizeFilename('../../evil.sh')).toBe('evil.sh')
    expect(sanitizeFilename('/etc/passwd')).toBe('passwd')
    expect(sanitizeFilename('a\\b\\c.png')).toBe('c.png')
    expect(sanitizeFilename('..')).toBe('upload')
    expect(sanitizeFilename('')).toBe('upload')
    expect(sanitizeFilename(undefined)).toBe('upload')
    expect(sanitizeFilename('photo.jpg')).toBe('photo.jpg')
  })
})

describe('resolveWithinDir', () => {
  it('returns a contained path and throws on escape', () => {
    const base = '/srv/uploads'
    expect(resolveWithinDir(base, 'a/b.jpg')).toBe('/srv/uploads/a/b.jpg')
    expect(() => resolveWithinDir(base, '../secret')).toThrow()
    expect(() => resolveWithinDir(base, '/etc/passwd')).toThrow()
    expect(() => resolveWithinDir(base, '../../../../app/src/main.ts')).toThrow()
  })
})

describe('LocalUploadProvider containment', () => {
  const dirs: string[] = []
  afterEach(async () => {
    for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true })
  })

  async function scratch(): Promise<{ uploadDir: string; outsideFile: string }> {
    const root = await mkdtemp(join(tmpdir(), 'ma-upload-'))
    dirs.push(root)
    const uploadDir = join(root, 'uploads')
    await mkdir(uploadDir, { recursive: true })
    const outsideFile = join(root, 'victim.txt')
    await writeFile(outsideFile, 'do-not-delete')
    return { uploadDir, outsideFile }
  }

  it('upload refuses a traversal key', async () => {
    const { uploadDir } = await scratch()
    const provider = new LocalUploadProvider({ uploadDir })
    await expect(provider.upload(file('x'), '../escape.sh')).rejects.toThrow()
  })

  it('delete never unlinks outside the upload directory', async () => {
    const { uploadDir, outsideFile } = await scratch()
    const provider = new LocalUploadProvider({ uploadDir })
    // Traversal from uploadDir to the sibling victim file.
    await provider.delete('../victim.txt')
    await provider.delete('/' + outsideFile.replace(/^\//, ''))
    // Victim survives.
    expect(await readFile(outsideFile, 'utf8')).toBe('do-not-delete')
  })

  it('round-trips a normal (and nested) key', async () => {
    const { uploadDir } = await scratch()
    const provider = new LocalUploadProvider({ uploadDir })
    const key = await provider.upload(file('photo.jpg'), 'a/b/photo.jpg')
    expect(key).toBe('a/b/photo.jpg')
    expect(await readFile(join(uploadDir, key), 'utf8')).toBe('abc')
    await provider.delete(key)
    await expect(readFile(join(uploadDir, key), 'utf8')).rejects.toThrow()
  })
})
