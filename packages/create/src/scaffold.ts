import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'

export interface ScaffoldOptions {
  name: string
  templateDir: string
  targetDir: string
  /**
   * Extra `{{tokens}}` to substitute into template files. By default
   * `{{name}}` is replaced with the project name.
   */
  variables?: Record<string, string>
}

const TOKEN_RE = /\{\{(\w+)\}\}/g

/**
 * Escape a substituted value so it stays syntactically inert in the target
 * file. `'json'` escapes quotes, backslashes and control characters (via
 * `JSON.stringify`, minus its surrounding quotes) so a value like `foo"bar`
 * can't break out of a `"name": "{{name}}"` string in package.json. The
 * default `'none'` leaves values verbatim (source files, filenames).
 */
type EscapeMode = 'none' | 'json'

const escapeValue = (value: string, mode: EscapeMode): string =>
  mode === 'json' ? JSON.stringify(value).slice(1, -1) : value

const renderTemplate = (
  source: string,
  variables: Record<string, string>,
  escape: EscapeMode = 'none',
): string =>
  source.replace(TOKEN_RE, (match, key: string) => {
    const value = variables[key]
    return value === undefined ? match : escapeValue(value, escape)
  })

const PROJECT_NAME_RE = /^[a-z0-9][a-z0-9._-]*$/

/**
 * Validate a scaffold project name before it is used as a directory name and
 * substituted into generated files (package.json et al.). The name doubles as
 * a path segment (`./<name>`) and a JSON string value, so it must not contain
 * path separators, traversal, or characters that would break either context.
 * Enforces an npm-package-name shape: lowercase, starts with a letter/digit,
 * only `-._` separators. Throws with a user-facing message on failure.
 */
export const validateProjectName = (name: string): void => {
  const trimmed = name.trim()
  if (trimmed === '') {
    throw new Error('Project name must not be empty.')
  }
  if (trimmed.length > 214) {
    throw new Error('Project name must be 214 characters or fewer.')
  }
  if (/[\\/]/.test(trimmed) || trimmed.includes('..')) {
    throw new Error(
      `Invalid project name "${name}": path separators and ".." are not allowed.`,
    )
  }
  if (!PROJECT_NAME_RE.test(trimmed)) {
    throw new Error(
      `Invalid project name "${name}": use lowercase letters, digits, "-", "_" or "." and start with a letter or digit.`,
    )
  }
}

const JSON_EXT_RE = /\.json$/i

/**
 * Map of template basenames that need to be renamed on copy. `bun pm pack`
 * (and `npm publish`) strip `.gitignore` and `.npmrc` from the published
 * tarball — see https://docs.npmjs.com/cli/v10/configuring-npm/package-json#files.
 * Ship them under neutral names in the template and restore the leading
 * dot when scaffolding.
 */
const DOTFILE_RENAMES: Record<string, string> = {
  _gitignore: '.gitignore',
  _npmrc: '.npmrc',
}

const renameBasename = (rel: string): string => {
  const slash = rel.lastIndexOf('/')
  const base = slash === -1 ? rel : rel.slice(slash + 1)
  const replacement = DOTFILE_RENAMES[base]
  if (!replacement) return rel
  return slash === -1 ? replacement : rel.slice(0, slash + 1) + replacement
}

const walk = async (dir: string): Promise<string[]> => {
  const out: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(full)))
    else if (entry.isFile()) out.push(full)
  }
  return out
}

/**
 * Render a template directory into `targetDir`, substituting `{{tokens}}`
 * inside text files. Throws when `targetDir` already contains files so a
 * scaffold never silently overwrites an existing project.
 */
export const scaffold = async (options: ScaffoldOptions): Promise<string[]> => {
  validateProjectName(options.name)
  const variables: Record<string, string> = { name: options.name, ...options.variables }

  await ensureEmptyTarget(options.targetDir)
  const files = await walk(options.templateDir)
  const written: string[] = []
  for (const file of files) {
    const rel = relative(options.templateDir, file)
    // Allow filename templating too (e.g. `{{name}}.config.ts`), then
    // restore dotfile prefixes that the npm pack pipeline strips
    // (`_gitignore` → `.gitignore`, `_npmrc` → `.npmrc`).
    const targetRel = renameBasename(renderTemplate(rel, variables))
    const target = join(options.targetDir, targetRel)
    await mkdir(dirname(target), { recursive: true })
    const buf = await readFile(file)
    if (isLikelyText(buf)) {
      // JSON-escape substituted values inside .json files so a variable can
      // never break the surrounding string literal (defence in depth on top
      // of validateProjectName).
      const escape: EscapeMode = JSON_EXT_RE.test(targetRel) ? 'json' : 'none'
      await writeFile(target, renderTemplate(buf.toString('utf8'), variables, escape), 'utf8')
    } else {
      await writeFile(target, buf)
    }
    written.push(target)
  }
  return written
}

const ensureEmptyTarget = async (dir: string): Promise<void> => {
  try {
    const entries = await readdir(dir)
    if (entries.length > 0) {
      throw new Error(`Target directory "${dir}" is not empty.`)
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      await mkdir(dir, { recursive: true })
      return
    }
    throw err
  }
}

/**
 * Version of the published `@modern-admin/create` package itself, read from
 * its own package.json. The scaffold template pins every `@modern-admin/*`
 * dependency to `^{{modernAdminVersion}}`, and the CLI substitutes this
 * value — the package versions in the linked changesets group move in
 * lockstep, so the CLI's own version always names the current release line
 * and the template can never drift behind published packages.
 *
 * `packageDir` is the directory containing package.json — the CLI passes
 * `../` relative to the executing module, which resolves correctly from
 * both `src/cli.ts` (bun bin) and the compiled `dist/cli.js`.
 */
export const readOwnVersion = async (packageDir: string): Promise<string> => {
  const raw = await readFile(join(packageDir, 'package.json'), 'utf8')
  const pkg = JSON.parse(raw) as { version?: string }
  if (!pkg.version) {
    throw new Error(`No "version" field in ${join(packageDir, 'package.json')}`)
  }
  return pkg.version
}

const isLikelyText = (buf: Buffer): boolean => {
  // Heuristic: NUL byte in the first 4 KiB → binary.
  const slice = buf.subarray(0, Math.min(buf.length, 4096))
  for (let i = 0; i < slice.length; i++) {
    if (slice[i] === 0) return false
  }
  return true
}

export { renderTemplate }

// Type-only import to satisfy `NodeJS.ErrnoException` reference under
// noUncheckedIndexedAccess without pulling in the @types/node package.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    interface ErrnoException extends Error {
      code?: string
    }
  }
}

// Avoid unused-stat import warning by exporting (used in tests).
export { stat }
