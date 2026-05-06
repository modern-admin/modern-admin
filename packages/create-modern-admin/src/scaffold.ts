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

const renderTemplate = (
  source: string,
  variables: Record<string, string>,
): string => source.replace(TOKEN_RE, (match, key: string) => variables[key] ?? match)

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
  const variables: Record<string, string> = { name: options.name, ...options.variables }

  await ensureEmptyTarget(options.targetDir)
  const files = await walk(options.templateDir)
  const written: string[] = []
  for (const file of files) {
    const rel = relative(options.templateDir, file)
    // Allow filename templating too (e.g. `{{name}}.config.ts`).
    const targetRel = renderTemplate(rel, variables)
    const target = join(options.targetDir, targetRel)
    await mkdir(dirname(target), { recursive: true })
    const buf = await readFile(file)
    if (isLikelyText(buf)) {
      await writeFile(target, renderTemplate(buf.toString('utf8'), variables), 'utf8')
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
