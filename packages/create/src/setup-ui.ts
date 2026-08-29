import { lstat, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readOwnVersion, scaffold } from './scaffold.js'

const DEFAULT_UI_DIR = 'ui'
const DEFAULT_API_PROXY = 'http://localhost:3001'
const DEFAULT_BASE_PATH = '/admin'
const ADMIN_API_PATH = '/admin/api'
const AUTH_BASE_PATH = '/admin/api/auth'
const STATIC_UI_CALL = 'ModernAdminStaticUiModule.forRoot'

const UI_RUNTIME_DEPENDENCIES: Record<string, string> = {
  react: '^19.2.8',
  'react-dom': '^19.2.8',
}

const UI_DEV_DEPENDENCIES: Record<string, string> = {
  '@tailwindcss/vite': '^4.3.3',
  '@types/bun': '^1.3.14',
  '@types/react': '^19.2.18',
  '@types/react-dom': '^19.2.4',
  '@vitejs/plugin-react': '^6.0.5',
  tailwindcss: '^4.3.3',
  typescript: '^7.0.2',
  vite: '^8.2.1',
}

interface PackageJson extends Record<string, unknown> {
  name?: string
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

export interface SetupUiOptions {
  /** Host project root. Defaults to `process.cwd()`. */
  cwd?: string
  /** Host-owned UI directory, relative to `cwd`. Defaults to `ui`. */
  uiDir?: string
  /** Nest module containing `ModernAdminStaticUiModule.forRoot(...)`.
   * Auto-detected under `src/` when omitted. */
  modulePath?: string
  /** Backend origin proxied by the generated Vite dev server. */
  apiProxy?: string
  /** Admin mount path used by the Vite dev runtime config. */
  basePath?: string
  /** Better Auth mount path used by the Vite dev runtime config. */
  authBasePath?: string
  /** Override the bundled UI template. Primarily useful to test wrappers. */
  templateDir?: string
}

export interface SetupUiResult {
  cwd: string
  uiDir: string
  modulePath: string
  createdFiles: string[]
  packageJsonChanged: boolean
  moduleChanged: boolean
  addedDependencies: string[]
  addedDevDependencies: string[]
  changedScripts: string[]
}

interface PackagePatch {
  output: string
  changed: boolean
  addedDependencies: string[]
  addedDevDependencies: string[]
  changedScripts: string[]
}

interface ModulePatch {
  output: string
  changed: boolean
}

type ScanState = 'code' | 'single' | 'double' | 'template' | 'line-comment' | 'block-comment'

const here = (): string => dirname(fileURLToPath(import.meta.url))

const defaultTemplateDir = (): string => join(here(), '..', 'ui-template')

const isMissing = (error: unknown): boolean => (error as { code?: string }).code === 'ENOENT'

const readPackageJson = (source: string, path: string): PackageJson => {
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch (error) {
    throw new Error(`Could not parse ${path}: ${(error as Error).message}`, {
      cause: error,
    })
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${path} must contain a JSON object.`)
  }
  return parsed as PackageJson
}

const stringRecord = (
  pkg: PackageJson,
  key: 'scripts' | 'dependencies' | 'devDependencies',
): Record<string, string> => {
  const current = pkg[key]
  if (current === undefined) {
    const value: Record<string, string> = {}
    pkg[key] = value
    return value
  }
  if (!current || typeof current !== 'object' || Array.isArray(current)) {
    throw new Error(`package.json field "${key}" must be an object.`)
  }
  for (const [name, value] of Object.entries(current)) {
    if (typeof value !== 'string') {
      throw new Error(`package.json field "${key}.${name}" must be a string.`)
    }
  }
  return current
}

const safeUiDir = (value: string | undefined): string => {
  const requested = value?.trim() || DEFAULT_UI_DIR
  if (isAbsolute(requested)) {
    throw new Error('--dir must be relative to the host project root.')
  }
  const normalized = normalize(requested).replaceAll('\\', '/')
  const parts = normalized.split('/')
  if (
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    parts.some((part) => part === '' || part === '.' || part === '..') ||
    !/^[a-zA-Z0-9._/-]+$/.test(normalized)
  ) {
    throw new Error(
      '--dir must be a safe relative path using letters, digits, ".", "_", "-" and "/".',
    )
  }
  return normalized
}

const safeUrlPath = (value: string | undefined, fallback: string, option: string): string => {
  const path = value?.trim() || fallback
  if (
    !path.startsWith('/') ||
    path.startsWith('//') ||
    path.includes('..') ||
    /[\\?#\s]/.test(path)
  ) {
    throw new Error(
      `${option} must be an absolute URL path without a query, fragment, whitespace or "..".`,
    )
  }
  if (path === '/') return path
  return path.endsWith('/') ? path.slice(0, -1) : path
}

const safeApiProxy = (value: string | undefined): string => {
  const proxy = value?.trim() || DEFAULT_API_PROXY
  let url: URL
  try {
    url = new URL(proxy)
  } catch {
    throw new Error('--api-proxy must be a valid http(s) origin.')
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.origin !== proxy) {
    throw new Error('--api-proxy must be a valid http(s) origin without a path.')
  }
  return proxy
}

const pathInside = (cwd: string, path: string, option: string): string => {
  const resolved = resolve(cwd, path)
  const rel = relative(cwd, resolved)
  if (rel === '..' || rel.startsWith('../') || isAbsolute(rel)) {
    throw new Error(`${option} must resolve inside the host project root.`)
  }
  return resolved
}

const assertNoSymlinkTraversal = async (
  cwd: string,
  target: string,
  option: string,
): Promise<void> => {
  const rel = relative(cwd, target)
  let current = cwd
  for (const segment of rel.split(sep).filter(Boolean)) {
    current = join(current, segment)
    try {
      const info = await lstat(current)
      if (info.isSymbolicLink()) {
        throw new Error(`${option} traverses the symbolic link ${current}; refusing to write.`)
      }
    } catch (error) {
      if (isMissing(error)) return
      throw error
    }
  }
}

const listTypeScriptFiles = async (dir: string): Promise<string[]> => {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (error) {
    if (isMissing(error)) return []
    throw error
  }
  const files: string[] = []
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await listTypeScriptFiles(path)))
    else if (entry.isFile() && /\.(?:ts|mts)$/.test(entry.name)) files.push(path)
  }
  return files
}

const codeOccurrence = (source: string, needle: string): number => {
  let state: ScanState = 'code'
  for (let i = 0; i < source.length; i++) {
    const char = source[i]!
    const next = source[i + 1]
    if (state === 'line-comment') {
      if (char === '\n') state = 'code'
      continue
    }
    if (state === 'block-comment') {
      if (char === '*' && next === '/') {
        state = 'code'
        i++
      }
      continue
    }
    if (state !== 'code') {
      if (char === '\\') {
        i++
        continue
      }
      if (
        (state === 'single' && char === "'") ||
        (state === 'double' && char === '"') ||
        (state === 'template' && char === '`')
      ) {
        state = 'code'
      }
      continue
    }
    if (char === '/' && next === '/') {
      state = 'line-comment'
      i++
    } else if (char === '/' && next === '*') {
      state = 'block-comment'
      i++
    } else if (char === "'") state = 'single'
    else if (char === '"') state = 'double'
    else if (char === '`') state = 'template'
    else if (source.startsWith(needle, i)) return i
  }
  return -1
}

const findStaticUiModule = async (
  cwd: string,
  requestedPath: string | undefined,
): Promise<string> => {
  if (requestedPath) {
    const path = pathInside(cwd, requestedPath, '--module')
    await assertNoSymlinkTraversal(cwd, path, '--module')
    try {
      await lstat(path)
    } catch (error) {
      if (isMissing(error)) {
        throw new Error(`Nest module not found at ${path}.`, { cause: error })
      }
      throw error
    }
    return path
  }

  const files = await listTypeScriptFiles(join(cwd, 'src'))
  const matches: string[] = []
  for (const path of files) {
    const source = await readFile(path, 'utf8')
    if (codeOccurrence(source, STATIC_UI_CALL) !== -1) matches.push(path)
  }
  if (matches.length === 0) {
    throw new Error(
      `Could not find ${STATIC_UI_CALL}(...) under ${join(cwd, 'src')}. ` +
        'Pass --module <path> or wire ModernAdminStaticUiModule first.',
    )
  }
  if (matches.length > 1) {
    throw new Error(
      `Found ${STATIC_UI_CALL}(...) in multiple files: ${matches.join(', ')}. ` +
        'Pass --module <path>.',
    )
  }
  return matches[0]!
}

const findClosingBrace = (source: string, opening: number): number => {
  let state: ScanState = 'code'
  let depth = 0
  for (let i = opening; i < source.length; i++) {
    const char = source[i]!
    const next = source[i + 1]
    if (state === 'line-comment') {
      if (char === '\n') state = 'code'
      continue
    }
    if (state === 'block-comment') {
      if (char === '*' && next === '/') {
        state = 'code'
        i++
      }
      continue
    }
    if (state !== 'code') {
      if (char === '\\') {
        i++
        continue
      }
      if (
        (state === 'single' && char === "'") ||
        (state === 'double' && char === '"') ||
        (state === 'template' && char === '`')
      ) {
        state = 'code'
      }
      continue
    }
    if (char === '/' && next === '/') {
      state = 'line-comment'
      i++
    } else if (char === '/' && next === '*') {
      state = 'block-comment'
      i++
    } else if (char === "'") state = 'single'
    else if (char === '"') state = 'double'
    else if (char === '`') state = 'template'
    else if (char === '{') depth++
    else if (char === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  throw new Error(`Could not find the closing brace for ${STATIC_UI_CALL}(...).`)
}

const topLevelPropertyColon = (body: string, property: string): number | null => {
  let state: ScanState = 'code'
  let depth = 0
  for (let i = 0; i < body.length; i++) {
    const char = body[i]!
    const next = body[i + 1]
    if (state === 'line-comment') {
      if (char === '\n') state = 'code'
      continue
    }
    if (state === 'block-comment') {
      if (char === '*' && next === '/') {
        state = 'code'
        i++
      }
      continue
    }
    if (state !== 'code') {
      if (char === '\\') {
        i++
        continue
      }
      if (
        (state === 'single' && char === "'") ||
        (state === 'double' && char === '"') ||
        (state === 'template' && char === '`')
      ) {
        state = 'code'
      }
      continue
    }
    if (char === '/' && next === '/') {
      state = 'line-comment'
      i++
      continue
    }
    if (char === '/' && next === '*') {
      state = 'block-comment'
      i++
      continue
    }
    if (char === "'") {
      state = 'single'
      continue
    }
    if (char === '"') {
      state = 'double'
      continue
    }
    if (char === '`') {
      state = 'template'
      continue
    }
    if (char === '{' || char === '[' || char === '(') {
      depth++
      continue
    }
    if (char === '}' || char === ']' || char === ')') {
      depth--
      continue
    }
    if (depth !== 0 || !/[a-zA-Z_$]/.test(char)) continue

    let end = i + 1
    while (end < body.length && /[a-zA-Z0-9_$]/.test(body[end]!)) end++
    if (body.slice(i, end) !== property) {
      i = end - 1
      continue
    }
    let colon = end
    while (colon < body.length && /\s/.test(body[colon]!)) colon++
    if (body[colon] === ':') return colon
    i = end - 1
  }
  return null
}

interface StringLiteral {
  value: string
  start: number
  end: number
  quote: "'" | '"'
}

interface StaticUiObject {
  call: number
  openingBrace: number
  closingBrace: number
  body: string
}

const stringLiteralAt = (source: string, start: number): StringLiteral | null => {
  let cursor = start
  while (cursor < source.length && /\s/.test(source[cursor]!)) cursor++
  const quote = source[cursor]
  if (quote !== "'" && quote !== '"') return null
  let value = ''
  for (let i = cursor + 1; i < source.length; i++) {
    const char = source[i]!
    if (char === '\\') {
      const next = source[i + 1]
      if (next === undefined) return null
      value += next
      i++
    } else if (char === quote) {
      return { value, start: cursor, end: i + 1, quote }
    } else value += char
  }
  return null
}

const staticUiObject = (source: string): StaticUiObject => {
  const call = codeOccurrence(source, STATIC_UI_CALL)
  if (call === -1) {
    throw new Error(`Could not find ${STATIC_UI_CALL}(...).`)
  }
  const openingParen = source.indexOf('(', call + STATIC_UI_CALL.length)
  if (openingParen === -1) {
    throw new Error(`Could not parse ${STATIC_UI_CALL}(...).`)
  }
  let openingBrace = openingParen + 1
  while (openingBrace < source.length && /\s/.test(source[openingBrace]!)) openingBrace++
  if (source[openingBrace] !== '{') {
    throw new Error(`${STATIC_UI_CALL}(...) must receive an inline options object.`)
  }
  const closingBrace = findClosingBrace(source, openingBrace)
  return {
    call,
    openingBrace,
    closingBrace,
    body: source.slice(openingBrace + 1, closingBrace),
  }
}

const staticUiStringOption = (source: string, property: string): string | undefined => {
  const { body } = staticUiObject(source)
  const colon = topLevelPropertyColon(body, property)
  if (colon === null) return undefined
  return stringLiteralAt(body, colon + 1)?.value
}

const staticUiRuntimeStringOption = (source: string, property: string): string | undefined => {
  const { body, openingBrace } = staticUiObject(source)
  const runtimeColon = topLevelPropertyColon(body, 'runtimeConfig')
  if (runtimeColon === null) return undefined
  let runtimeOpening = openingBrace + 1 + runtimeColon + 1
  while (runtimeOpening < source.length && /\s/.test(source[runtimeOpening]!)) {
    runtimeOpening++
  }
  if (source[runtimeOpening] !== '{') return undefined
  const runtimeClosing = findClosingBrace(source, runtimeOpening)
  const runtimeBody = source.slice(runtimeOpening + 1, runtimeClosing)
  const propertyColon = topLevelPropertyColon(runtimeBody, property)
  if (propertyColon === null) return undefined
  return stringLiteralAt(runtimeBody, propertyColon + 1)?.value
}

/** Add `webPackage` to an existing literal Static UI options object. */
export const patchStaticUiModule = (source: string, webPackage: string): ModulePatch => {
  const { body, call, closingBrace, openingBrace } = staticUiObject(source)
  const existingColon = topLevelPropertyColon(body, 'webPackage')
  if (existingColon !== null) {
    const existing = stringLiteralAt(body, existingColon + 1)
    if (existing?.value === webPackage) return { output: source, changed: false }
    if (existing?.value === '@modern-admin/web') {
      const valueStart = openingBrace + 1 + existing.start
      const valueEnd = openingBrace + 1 + existing.end
      const replacement = `${existing.quote}${webPackage}${existing.quote}`
      return {
        output: source.slice(0, valueStart) + replacement + source.slice(valueEnd),
        changed: true,
      }
    }
    throw new Error(
      `${STATIC_UI_CALL}(...) already defines webPackage` +
        (existing ? ` as "${existing.value}"` : '') +
        '; refusing to overwrite it.',
    )
  }

  const lineStart = source.lastIndexOf('\n', call) + 1
  const callIndent = /^\s*/.exec(source.slice(lineStart, call))?.[0] ?? ''
  const property = `webPackage: '${webPackage}'`
  if (body.trim() === '') {
    const output = source.slice(0, openingBrace + 1) + ` ${property} ` + source.slice(closingBrace)
    return { output, changed: true }
  }
  const multiline = source[openingBrace + 1] === '\n' || source[openingBrace + 1] === '\r'
  const eol = source.includes('\r\n') ? '\r\n' : '\n'
  const insertion = multiline ? `${eol}${callIndent}  ${property},` : ` ${property},`
  const output = source.slice(0, openingBrace + 1) + insertion + source.slice(openingBrace + 1)
  return { output, changed: true }
}

const modernAdminRange = async (pkg: PackageJson): Promise<string> => {
  const dependencies = {
    ...(pkg.devDependencies ?? {}),
    ...(pkg.dependencies ?? {}),
  }
  for (const preferred of ['@modern-admin/web', '@modern-admin/nest', '@modern-admin/core']) {
    if (dependencies[preferred]) return dependencies[preferred]
  }
  const existing = Object.entries(dependencies).find(([name]) => name.startsWith('@modern-admin/'))
  if (existing) return existing[1]
  return `^${await readOwnVersion(join(here(), '..'))}`
}

const deriveUiPackageName = (hostName: unknown): string => {
  if (typeof hostName !== 'string' || hostName.trim() === '') {
    return 'modern-admin-custom-ui'
  }
  const name = hostName.trim()
  if (/^@[a-z0-9._-]+\/[a-z0-9._-]+$/.test(name)) return `${name}-ui`
  if (/^[a-z0-9][a-z0-9._-]*$/.test(name)) return `${name}-ui`
  return 'modern-admin-custom-ui'
}

const typescriptString = (value: string): string =>
  `'${value
    .replaceAll('\\', '\\\\')
    .replaceAll("'", "\\'")
    .replaceAll('\r', '\\r')
    .replaceAll('\n', '\\n')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')}'`

const typescriptStringArray = (values: string[]): string =>
  `[${values.map(typescriptString).join(', ')}]`

const formatPackageJson = (source: string, pkg: PackageJson): string => {
  const indent = /\n([ \t]+)"/.exec(source)?.[1] ?? '  '
  const trailingNewline = source.endsWith('\n') ? '\n' : ''
  return JSON.stringify(pkg, null, indent) + trailingNewline
}

const patchPackageJson = async (
  source: string,
  path: string,
  uiDir: string,
): Promise<PackagePatch> => {
  const pkg = readPackageJson(source, path)
  const scripts = stringRecord(pkg, 'scripts')
  const dependencies = stringRecord(pkg, 'dependencies')
  const devDependencies = stringRecord(pkg, 'devDependencies')
  const range = await modernAdminRange(pkg)
  const addedDependencies: string[] = []
  const addedDevDependencies: string[] = []
  const changedScripts: string[] = []

  const hasDependency = (name: string): boolean =>
    dependencies[name] !== undefined || devDependencies[name] !== undefined
  const addDependency = (
    target: Record<string, string>,
    added: string[],
    name: string,
    version: string,
  ): void => {
    if (hasDependency(name)) return
    target[name] = version
    added.push(name)
  }

  for (const name of ['@modern-admin/react', '@modern-admin/ui', '@modern-admin/web']) {
    addDependency(dependencies, addedDependencies, name, range)
  }
  for (const [name, version] of Object.entries(UI_RUNTIME_DEPENDENCIES)) {
    addDependency(dependencies, addedDependencies, name, version)
  }
  for (const [name, version] of Object.entries(UI_DEV_DEPENDENCIES)) {
    addDependency(devDependencies, addedDevDependencies, name, version)
  }

  const ensureScript = (name: string, command: string): void => {
    if (scripts[name] !== undefined) return
    scripts[name] = command
    changedScripts.push(name)
  }
  const includeScript = (name: string, command: string, position: 'before' | 'after'): void => {
    const current = scripts[name]
    if (current === undefined) {
      scripts[name] = command
      changedScripts.push(name)
    } else if (!current.includes(command)) {
      scripts[name] =
        position === 'before' ? `${command} && ${current}` : `${current} && ${command}`
      changedScripts.push(name)
    }
  }

  ensureScript('ui:dev', `bun run --cwd ${uiDir} dev`)
  ensureScript('ui:build', `bun run --cwd ${uiDir} build`)
  ensureScript('ui:typecheck', `bun run --cwd ${uiDir} typecheck`)
  includeScript('build', 'bun run ui:build', 'after')
  includeScript('typecheck', 'bun run ui:typecheck', 'after')
  if (scripts.dev !== undefined) includeScript('dev', 'bun run ui:build', 'before')

  const output = formatPackageJson(source, pkg)
  return {
    output,
    changed: output !== source,
    addedDependencies,
    addedDevDependencies,
    changedScripts,
  }
}

const inspectUiTarget = async (targetDir: string): Promise<'create' | 'existing'> => {
  try {
    const info = await lstat(targetDir)
    if (info.isSymbolicLink()) {
      throw new Error(`UI target ${targetDir} is a symbolic link; refusing to write through it.`)
    }
    if (!info.isDirectory()) throw new Error(`UI target ${targetDir} is not a directory.`)
  } catch (error) {
    if (isMissing(error)) return 'create'
    throw error
  }

  const entries = await readdir(targetDir)
  if (entries.length === 0) return 'create'
  try {
    const packagePath = join(targetDir, 'package.json')
    const pkg = readPackageJson(await readFile(packagePath, 'utf8'), packagePath)
    const marker = pkg.modernAdmin
    if (
      marker &&
      typeof marker === 'object' &&
      !Array.isArray(marker) &&
      (marker as Record<string, unknown>).customUi === true
    ) {
      return 'existing'
    }
  } catch (error) {
    if (!isMissing(error)) throw error
  }
  throw new Error(
    `UI target ${targetDir} is not empty and was not generated by modern-admin setup-ui.`,
  )
}

/**
 * Scaffold a host-owned admin SPA and connect it to the existing Nest static
 * UI module. Existing custom UI files are never overwritten.
 */
export const setupUi = async (options: SetupUiOptions = {}): Promise<SetupUiResult> => {
  const cwd = resolve(options.cwd ?? process.cwd())
  const uiDir = safeUiDir(options.uiDir)
  const targetDir = pathInside(cwd, uiDir, '--dir')
  await assertNoSymlinkTraversal(cwd, targetDir, '--dir')
  const apiProxy = safeApiProxy(options.apiProxy)
  const packagePath = join(cwd, 'package.json')
  await assertNoSymlinkTraversal(cwd, packagePath, 'package.json')
  let packageSource: string
  try {
    packageSource = await readFile(packagePath, 'utf8')
  } catch (error) {
    if (isMissing(error)) {
      throw new Error(`Host package.json not found at ${packagePath}.`, { cause: error })
    }
    throw error
  }

  const hostPackage = readPackageJson(packageSource, packagePath)
  const modulePath = await findStaticUiModule(cwd, options.modulePath)
  const moduleSource = await readFile(modulePath, 'utf8')
  const basePath = safeUrlPath(
    options.basePath ?? staticUiStringOption(moduleSource, 'path'),
    DEFAULT_BASE_PATH,
    '--base-path',
  )
  const authBasePath = safeUrlPath(
    options.authBasePath ?? staticUiRuntimeStringOption(moduleSource, 'authBasePath'),
    AUTH_BASE_PATH,
    '--auth-base-path',
  )
  const webPackage = `./${uiDir}`
  const modulePatch = patchStaticUiModule(moduleSource, webPackage)
  const packagePatch = await patchPackageJson(packageSource, packagePath, uiDir)
  const targetState = await inspectUiTarget(targetDir)

  let createdFiles: string[] = []
  if (targetState === 'create') {
    createdFiles = await scaffold({
      name: 'ui',
      templateDir: options.templateDir ?? defaultTemplateDir(),
      targetDir,
      variables: {
        packageName: deriveUiPackageName(hostPackage.name),
        apiProxy: typescriptString(apiProxy),
        apiProxyPaths: typescriptStringArray([
          ADMIN_API_PATH,
          ...(authBasePath === ADMIN_API_PATH || authBasePath.startsWith(`${ADMIN_API_PATH}/`)
            ? []
            : [authBasePath]),
          '/socket.io',
        ]),
        authBasePath: typescriptString(authBasePath),
        basePath: typescriptString(basePath),
      },
    })
  }
  if (packagePatch.changed) await writeFile(packagePath, packagePatch.output, 'utf8')
  if (modulePatch.changed) await writeFile(modulePath, modulePatch.output, 'utf8')

  return {
    cwd,
    uiDir: targetDir,
    modulePath,
    createdFiles,
    packageJsonChanged: packagePatch.changed,
    moduleChanged: modulePatch.changed,
    addedDependencies: packagePatch.addedDependencies,
    addedDevDependencies: packagePatch.addedDevDependencies,
    changedScripts: packagePatch.changedScripts,
  }
}
