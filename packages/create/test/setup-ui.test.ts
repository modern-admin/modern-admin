import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { patchStaticUiModule, setupUi } from '../src/setup-ui.js'

const MODULE = `import { Module } from '@nestjs/common'
import { ModernAdminStaticUiModule } from '@modern-admin/nest'

@Module({
  imports: [
    ModernAdminStaticUiModule.forRoot({
      path: '/admin',
      runtimeConfig: { apiUrl: '' },
    }),
  ],
})
export class AppModule {}
`

describe('patchStaticUiModule', () => {
  test('adds webPackage to the top-level options object', () => {
    const result = patchStaticUiModule(MODULE, './ui')
    expect(result.changed).toBe(true)
    expect(result.output).toContain("webPackage: './ui',\n      path: '/admin'")
  })

  test('ignores a call-shaped example in a comment', () => {
    const source = `// ModernAdminStaticUiModule.forRoot({ webPackage: './example' })\n${MODULE}`
    const result = patchStaticUiModule(source, './ui')
    expect(result.output).toContain("      webPackage: './ui',")
    expect(result.output).toContain(
      "// ModernAdminStaticUiModule.forRoot({ webPackage: './example' })",
    )
  })

  test('does not confuse a nested or commented property with webPackage', () => {
    const source = MODULE.replace(
      "runtimeConfig: { apiUrl: '' },",
      "runtimeConfig: { webPackage: 'not-this-one' },\n      // webPackage: './old',",
    )
    const result = patchStaticUiModule(source, './ui')
    expect(result.output.match(/webPackage/g)?.length).toBe(3)
    expect(result.output).toContain("      webPackage: './ui',")
  })

  test('is a no-op when the same package is already connected', () => {
    const once = patchStaticUiModule(MODULE, './ui').output
    const twice = patchStaticUiModule(once, './ui')
    expect(twice).toEqual({ output: once, changed: false })
  })

  test('replaces the explicit prebuilt default package', () => {
    const source = MODULE.replace(
      "path: '/admin',",
      "webPackage: '@modern-admin/web',\n      path: '/admin',",
    )
    const result = patchStaticUiModule(source, './ui')
    expect(result.changed).toBe(true)
    expect(result.output).toContain("webPackage: './ui'")
    expect(result.output).not.toContain("webPackage: '@modern-admin/web'")
  })

  test('refuses to replace a different custom bundle', () => {
    const source = MODULE.replace(
      "path: '/admin',",
      "webPackage: './brand-ui',\n      path: '/admin',",
    )
    expect(() => patchStaticUiModule(source, './ui')).toThrow(/refusing to overwrite/i)
  })
})

describe('setupUi', () => {
  let cwd: string

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), 'modern-admin-ui-'))
    await mkdir(join(cwd, 'src'), { recursive: true })
    await writeFile(
      join(cwd, 'package.json'),
      JSON.stringify(
        {
          name: '@example/admin',
          private: true,
          scripts: {
            dev: 'bun --watch run src/main.ts',
            build: 'tsc',
            typecheck: 'tsc --noEmit',
          },
          dependencies: { '@modern-admin/nest': '^0.5.0' },
        },
        null,
        2,
      ) + '\n',
    )
    await writeFile(join(cwd, 'src', 'app.module.ts'), MODULE)
  })

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true })
  })

  test('creates, connects and configures a base custom UI', async () => {
    const result = await setupUi({
      cwd,
      apiProxy: 'http://localhost:3334',
      basePath: '/backoffice',
    })

    expect(result.createdFiles.length).toBeGreaterThan(0)
    expect(result.packageJsonChanged).toBe(true)
    expect(result.moduleChanged).toBe(true)

    const uiPackage = JSON.parse(await readFile(join(cwd, 'ui', 'package.json'), 'utf8'))
    expect(uiPackage.name).toBe('@example/admin-ui')
    expect(uiPackage.modernAdmin.customUi).toBe(true)
    for (const path of result.createdFiles) {
      expect(await readFile(path, 'utf8')).not.toContain('{{')
    }
    expect(await readFile(join(cwd, 'ui', 'src', 'admin-components.ts'), 'utf8')).toContain(
      'new ComponentLoader()',
    )
    const vite = await readFile(join(cwd, 'ui', 'vite.config.ts'), 'utf8')
    expect(vite).toContain("apiProxy: 'http://localhost:3334'")
    expect(vite).toContain("apiProxyPath: ['/admin/api', '/socket.io']")
    expect(vite).toContain("authBasePath: '/admin/api/auth'")
    expect(vite).toContain("basePath: '/backoffice'")

    const host = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8'))
    expect(host.dependencies['@modern-admin/react']).toBe('^0.5.0')
    expect(host.dependencies['@modern-admin/ui']).toBe('^0.5.0')
    expect(host.dependencies.react).toBe('^19.2.8')
    expect(host.devDependencies.vite).toBe('^8.2.1')
    expect(host.scripts['ui:build']).toBe('bun run --cwd ui build')
    expect(host.scripts.dev).toBe('bun run ui:build && bun --watch run src/main.ts')
    expect(host.scripts.build).toBe('tsc && bun run ui:build')
    expect(host.scripts.typecheck).toBe('tsc --noEmit && bun run ui:typecheck')

    const module = await readFile(join(cwd, 'src', 'app.module.ts'), 'utf8')
    expect(module).toContain("webPackage: './ui'")
  })

  test('re-running preserves host components and makes no duplicate edits', async () => {
    await setupUi({ cwd })
    const componentsPath = join(cwd, 'ui', 'src', 'admin-components.ts')
    const customized = `${await readFile(componentsPath, 'utf8')}\n// host customization\n`
    await writeFile(componentsPath, customized)

    const second = await setupUi({ cwd })
    expect(second.createdFiles).toEqual([])
    expect(second.packageJsonChanged).toBe(false)
    expect(second.moduleChanged).toBe(false)
    expect(await readFile(componentsPath, 'utf8')).toBe(customized)

    const module = await readFile(join(cwd, 'src', 'app.module.ts'), 'utf8')
    expect(module.match(/webPackage/g)?.length).toBe(1)
  })

  test('keeps dependency versions already selected by the host', async () => {
    const packagePath = join(cwd, 'package.json')
    const host = JSON.parse(await readFile(packagePath, 'utf8'))
    host.dependencies.react = '^19.1.0'
    host.devDependencies = { vite: '^8.1.0' }
    await writeFile(packagePath, JSON.stringify(host, null, 2) + '\n')

    await setupUi({ cwd })
    const updated = JSON.parse(await readFile(packagePath, 'utf8'))
    expect(updated.dependencies.react).toBe('^19.1.0')
    expect(updated.devDependencies.vite).toBe('^8.1.0')
  })

  test('auto-detects a non-default module filename', async () => {
    await mkdir(join(cwd, 'src', 'admin'), { recursive: true })
    await writeFile(join(cwd, 'src', 'admin', 'panel.ts'), MODULE)
    await writeFile(join(cwd, 'src', 'app.module.ts'), 'export class AppModule {}\n')

    const result = await setupUi({ cwd })
    expect(result.modulePath).toBe(join(cwd, 'src', 'admin', 'panel.ts'))
  })

  test('infers the SPA base path without moving the fixed API routes', async () => {
    await writeFile(
      join(cwd, 'src', 'app.module.ts'),
      MODULE.replace("path: '/admin'", "path: '/backoffice'"),
    )

    await setupUi({ cwd })
    const vite = await readFile(join(cwd, 'ui', 'vite.config.ts'), 'utf8')
    expect(vite).toContain("apiProxyPath: ['/admin/api', '/socket.io']")
    expect(vite).toContain("authBasePath: '/admin/api/auth'")
    expect(vite).toContain("basePath: '/backoffice'")
  })

  test('infers a custom Better Auth path and proxies it separately', async () => {
    await writeFile(
      join(cwd, 'src', 'app.module.ts'),
      MODULE.replace(
        "runtimeConfig: { apiUrl: '' },",
        "runtimeConfig: { apiUrl: '', authBasePath: '/api/auth' },",
      ),
    )

    await setupUi({ cwd })
    const vite = await readFile(join(cwd, 'ui', 'vite.config.ts'), 'utf8')
    expect(vite).toContain("apiProxyPath: ['/admin/api', '/api/auth', '/socket.io']")
    expect(vite).toContain("authBasePath: '/api/auth'")
  })

  test('supports a nested custom UI directory', async () => {
    await setupUi({ cwd, uiDir: 'frontend/admin' })

    expect(await readFile(join(cwd, 'frontend', 'admin', 'index.html'), 'utf8')).toContain(
      '<div id="root"></div>',
    )
    const host = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8'))
    expect(host.scripts['ui:build']).toBe('bun run --cwd frontend/admin build')
    const module = await readFile(join(cwd, 'src', 'app.module.ts'), 'utf8')
    expect(module).toContain("webPackage: './frontend/admin'")
  })

  test('refuses an unmarked non-empty target before editing host files', async () => {
    await mkdir(join(cwd, 'ui'))
    await writeFile(join(cwd, 'ui', 'mine.tsx'), 'export {}\n')
    const beforePackage = await readFile(join(cwd, 'package.json'), 'utf8')
    const beforeModule = await readFile(join(cwd, 'src', 'app.module.ts'), 'utf8')

    await expect(setupUi({ cwd })).rejects.toThrow(/not empty/i)
    expect(await readFile(join(cwd, 'package.json'), 'utf8')).toBe(beforePackage)
    expect(await readFile(join(cwd, 'src', 'app.module.ts'), 'utf8')).toBe(beforeModule)
  })

  test('rejects target traversal', async () => {
    await expect(setupUi({ cwd, uiDir: '../ui' })).rejects.toThrow(/safe relative path/i)
  })

  test('rejects a target whose parent is a symbolic link', async () => {
    await mkdir(join(cwd, 'actual-ui-parent'))
    await symlink(join(cwd, 'actual-ui-parent'), join(cwd, 'linked-ui-parent'), 'dir')

    await expect(setupUi({ cwd, uiDir: 'linked-ui-parent/ui' })).rejects.toThrow(/symbolic link/i)
  })
})
