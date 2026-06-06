/**
 * Snapshot diff utilities — shared between server-side history capture
 * (feature-history) and the client-side revisions UI (`packages/react`).
 *
 * Kept transport- and ORM-agnostic so both layers can render exactly the
 * same diff without round-tripping every entry through the network.
 */

export interface FieldDiffEntry {
  /** Top-level field name. (Nested paths are not split — the value is
   *  compared structurally via `valuesEqual`.) */
  path: string
  before?: unknown
  after?: unknown
  kind: 'added' | 'changed' | 'removed'
}

const has = (obj: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(obj, key)

/**
 * JSON.stringify with deterministic key ordering for stable structural
 * equality. Used by `valuesEqual` and as a hash for the side-by-side
 * revision viewer.
 */
export const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (value instanceof Date) return JSON.stringify(value.toISOString())
  // Honour custom `toJSON` (e.g. Decimal.js, Day.js, Mongo ObjectId) so
  // values that round-trip through JSON keep stable identity.
  if (typeof (value as { toJSON?: unknown }).toJSON === 'function') {
    return stableStringify((value as { toJSON: () => unknown }).toJSON())
  }
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
  return `{${entries.join(',')}}`
}

/** Structural equality based on `stableStringify`. */
export const valuesEqual = (a: unknown, b: unknown): boolean =>
  stableStringify(a) === stableStringify(b)

/**
 * Compare two record snapshots and return the field-level diff.
 *
 * Excluded fields are dropped from both sides before comparison. The
 * output is sorted alphabetically by `path` for stable rendering.
 */
export function computeFieldDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  excludeFields: ReadonlySet<string> = new Set(),
): FieldDiffEntry[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  const out: FieldDiffEntry[] = []
  for (const path of [...keys].sort((a, b) => a.localeCompare(b))) {
    if (excludeFields.has(path)) continue
    const beforeHas = has(before, path)
    const afterHas = has(after, path)
    if (!beforeHas && afterHas) {
      out.push({ path, after: after[path], kind: 'added' })
    } else if (beforeHas && !afterHas) {
      out.push({ path, before: before[path], kind: 'removed' })
    } else if (!valuesEqual(before[path], after[path])) {
      out.push({ path, before: before[path], after: after[path], kind: 'changed' })
    }
  }
  return out
}

/** Convenience alias used by the React revisions side panel. */
export const diffSnapshots = computeFieldDiff

/** Return a shallow copy of `value` with `excludeFields` removed. */
export function omitFields(
  value: Record<string, unknown>,
  excludeFields: ReadonlySet<string>,
): Record<string, unknown> {
  if (excludeFields.size === 0) return { ...value }
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (!excludeFields.has(key)) out[key] = item
  }
  return out
}
