/**
 * Path-safety helpers shared by the upload providers and the upload
 * entry points (REST controller + GraphQL extension).
 *
 * Storage keys and filenames are attacker-controllable in two ways:
 *
 *   1. **Upload** — the client-supplied `originalName` flows into key
 *      generation (default `uuid + extname`, or a custom `uploadPath`). A raw
 *      name like `../../evil.sh` must never be able to steer the key outside
 *      the intended storage space.
 *   2. **Delete** — a `type: 'file'` property is just a string in the DB. An
 *      attacker who can edit a record can write `../../../../etc/passwd` into
 *      it; the next edit/delete would call `provider.delete(key)` with that
 *      value. Without containment the local provider's `unlink` escapes the
 *      upload directory.
 *
 * Defense is layered: keys are rejected at the transport boundary
 * (`isUnsafeKey`), filenames are sanitised before they can influence a key
 * (`sanitizeFilename`), and the local provider resolves every path against its
 * upload directory (`resolveWithinDir`) as the authoritative backstop.
 */

import { resolve, sep } from 'node:path'

/**
 * True when `key` must be refused: empty, containing a NUL byte, absolute
 * (POSIX `/…` or Windows `C:\…`), or containing a `..` traversal segment.
 *
 * Forward and back slashes are both treated as separators so a key crafted on
 * one platform cannot escape on another. Legitimate nested keys
 * (`avatars/2024/uuid.jpg`) and prefixes are allowed — only traversal and
 * absolute paths are rejected.
 */
export function isUnsafeKey(key: unknown): boolean {
  if (typeof key !== 'string' || key.length === 0) return true
  if (key.includes('\0')) return true
  const normalized = key.replace(/\\/g, '/')
  if (normalized.startsWith('/')) return true // POSIX absolute
  if (/^[a-zA-Z]:/.test(normalized)) return true // Windows drive-absolute
  return normalized.split('/').some((segment) => segment === '..')
}

/**
 * Reduce a client-supplied filename to a safe basename that cannot influence
 * the directory a key resolves into. Strips any directory components (either
 * separator), NUL bytes, and leading dots (so `..` / hidden-traversal names
 * collapse). Falls back to `'upload'` when nothing safe remains.
 */
export function sanitizeFilename(name: unknown): string {
  if (typeof name !== 'string' || name.length === 0) return 'upload'
  const base = name.replace(/\\/g, '/').split('/').pop() ?? ''
  const cleaned = base
    .replace(/\0/g, '')
    .replace(/^\.+/, '') // no leading dots → no bare '..' / hidden traversal
    .trim()
  return cleaned.length > 0 ? cleaned : 'upload'
}

/**
 * Resolve `key` against `baseDir` and guarantee the result stays inside it.
 * Throws when the resolved path escapes the directory (traversal / absolute
 * key). Returns the absolute, contained path for the caller to read/write.
 */
export function resolveWithinDir(baseDir: string, key: string): string {
  const base = resolve(baseDir)
  const full = resolve(base, key)
  if (full !== base && !full.startsWith(base + sep)) {
    throw new Error(
      `[modern-admin/feature-upload] refusing to access "${key}" outside the upload directory`,
    )
  }
  return full
}
