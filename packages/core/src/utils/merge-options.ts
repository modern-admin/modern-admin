// Deep merge helper used to merge feature/plugin-produced ResourceOptions
// with user-provided ones. Plain objects are deep-merged, scalars are
// overridden by `override`. Arrays merge per key: `'concat'` by default
// (additive lists like `relatedResources`), `'replace'` for keys registered
// in the strategy map — ordered whitelists like `listProperties`, where
// concatenation would duplicate entries instead of letting a later layer
// override an earlier one.

export type ArrayMergeStrategy = 'concat' | 'replace'

/**
 * Array-merge strategy per key. Keys are dot-joined paths from the merge
 * root; a `*` segment matches exactly one key at that depth
 * (e.g. `'properties.*.availableValues'`). Unlisted paths concatenate.
 */
export type ArrayMergeStrategies = Record<string, ArrayMergeStrategy>

/**
 * Canonical strategies for layering {@link ResourceOptions}
 * (features → global plugins → user options). Keys that describe a
 * complete, ordered selection are replaced wholesale by the later layer;
 * everything else keeps the additive concat default.
 */
export const RESOURCE_OPTIONS_ARRAY_STRATEGIES: ArrayMergeStrategies = {
  listProperties: 'replace',
  showProperties: 'replace',
  editProperties: 'replace',
  filterProperties: 'replace',
  'properties.*.availableValues': 'replace',
  'properties.*.keyValueFields': 'replace',
  'actions.*.nesting': 'replace',
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null
  && typeof value === 'object'
  && (Object.getPrototypeOf(value) === Object.prototype
    || Object.getPrototypeOf(value) === null)

const strategyFor = (
  path: string[],
  strategies: ArrayMergeStrategies,
): ArrayMergeStrategy => {
  for (const [pattern, strategy] of Object.entries(strategies)) {
    const parts = pattern.split('.')
    if (parts.length !== path.length) continue
    if (parts.every((part, i) => part === '*' || part === path[i])) {
      return strategy
    }
  }
  return 'concat'
}

function mergeValue(
  base: unknown,
  override: unknown,
  strategies: ArrayMergeStrategies,
  path: string[],
): unknown {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override ?? base
  }
  const out: Record<string, unknown> = { ...base }
  for (const key of Object.keys(override)) {
    const childPath = [...path, key]
    const a = base[key]
    const b = override[key]
    if (Array.isArray(a) && Array.isArray(b)) {
      out[key] = strategyFor(childPath, strategies) === 'replace'
        ? [...b]
        : [...a, ...b]
    } else if (isPlainObject(a) && isPlainObject(b)) {
      out[key] = mergeValue(a, b, strategies, childPath)
    } else {
      out[key] = b
    }
  }
  return out
}

export function deepMerge<T>(
  base: T,
  override: Partial<T>,
  strategies: ArrayMergeStrategies = {},
): T {
  return mergeValue(base, override, strategies, []) as T
}
