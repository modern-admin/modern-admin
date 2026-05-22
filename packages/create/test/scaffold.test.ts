import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { renderTemplate, scaffold } from '../src/scaffold.js'

const makeTempDir = async (): Promise<string> =>
  mkdtemp(join(tmpdir(), 'modern-admin-create-'))

describe('renderTemplate', () => {
  test('substitutes {{name}} tokens', () => {
    expect(renderTemplate('hello {{name}}', { name: 'world' })).toBe('hello world')
  })

  test('leaves unknown tokens untouched', () => {
    expect(renderTemplate('{{missing}}', { name: 'x' })).toBe('{{missing}}')
  })

  test('replaces multiple occurrences', () => {
    expect(renderTemplate('{{a}}-{{a}}-{{b}}', { a: '1', b: '2' })).toBe('1-1-2')
  })
})

describe('scaffold', () => {
  let templateDir: string
  let targetDir: string

  beforeEach(async () => {
    templateDir = await makeTempDir()
    targetDir = await makeTempDir()
    // Empty target dirs created by mkdtemp are allowed; remove for ENOENT branch
    // tests when needed.
  })

  afterEach(async () => {
    await rm(templateDir, { recursive: true, force: true })
    await rm(targetDir, { recursive: true, force: true })
  })

  test('substitutes tokens in file contents', async () => {
    await writeFile(join(templateDir, 'package.json'), '{"name":"{{name}}"}')
    await scaffold({ name: 'my-app', templateDir, targetDir })
    const out = await readFile(join(targetDir, 'package.json'), 'utf8')
    expect(out).toBe('{"name":"my-app"}')
  })

  test('substitutes tokens in filenames', async () => {
    await writeFile(join(templateDir, '{{name}}.config.ts'), 'export default {}')
    await scaffold({ name: 'demo', templateDir, targetDir })
    const out = await readFile(join(targetDir, 'demo.config.ts'), 'utf8')
    expect(out).toBe('export default {}')
  })

  test('walks nested directories', async () => {
    await mkdir(join(templateDir, 'src'), { recursive: true })
    await writeFile(join(templateDir, 'src', 'main.ts'), '// {{name}}')
    await scaffold({ name: 'nested', templateDir, targetDir })
    const out = await readFile(join(targetDir, 'src', 'main.ts'), 'utf8')
    expect(out).toBe('// nested')
  })

  test('passes extra variables through', async () => {
    await writeFile(join(templateDir, 'a.txt'), '{{greeting}} {{name}}')
    await scaffold({
      name: 'bob',
      templateDir,
      targetDir,
      variables: { greeting: 'hi' },
    })
    expect(await readFile(join(targetDir, 'a.txt'), 'utf8')).toBe('hi bob')
  })

  test('preserves binary files without substitution', async () => {
    // Construct a buffer with a NUL byte that also contains {{name}} bytes —
    // the substitution must not run on it.
    const binary = Buffer.concat([
      Buffer.from([0x00, 0x01, 0x02]),
      Buffer.from('{{name}}'),
      Buffer.from([0xff]),
    ])
    await writeFile(join(templateDir, 'logo.bin'), binary)
    await scaffold({ name: 'whatever', templateDir, targetDir })
    const out = await readFile(join(targetDir, 'logo.bin'))
    expect(out.equals(binary)).toBe(true)
  })

  test('rejects non-empty target directory', async () => {
    await writeFile(join(templateDir, 'a.txt'), 'hello')
    await writeFile(join(targetDir, 'existing.txt'), 'do not touch')
    await expect(scaffold({ name: 'x', templateDir, targetDir })).rejects.toThrow(
      /not empty/i,
    )
  })

  test('creates target directory when missing', async () => {
    const missing = join(targetDir, 'sub', 'nested')
    await writeFile(join(templateDir, 'a.txt'), 'ok')
    const written = await scaffold({ name: 'x', templateDir, targetDir: missing })
    expect(written.length).toBe(1)
    expect(await readFile(join(missing, 'a.txt'), 'utf8')).toBe('ok')
  })

  test('renames _gitignore and _npmrc to dotfiles', async () => {
    await writeFile(join(templateDir, '_gitignore'), 'node_modules\n')
    await writeFile(join(templateDir, '_npmrc'), 'registry=https://x\n')
    await scaffold({ name: 'x', templateDir, targetDir })
    expect(await readFile(join(targetDir, '.gitignore'), 'utf8')).toBe('node_modules\n')
    expect(await readFile(join(targetDir, '.npmrc'), 'utf8')).toBe('registry=https://x\n')
  })

  test('returns list of written files', async () => {
    await writeFile(join(templateDir, 'a.txt'), 'one')
    await writeFile(join(templateDir, 'b.txt'), 'two')
    const written = await scaffold({ name: 'x', templateDir, targetDir })
    expect(written.length).toBe(2)
    expect(written.every((p) => p.startsWith(targetDir))).toBe(true)
  })
})
