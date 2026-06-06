// Deep merge helper used to merge feature-produced ResourceOptions with
// user-provided ones. Arrays are concatenated, plain objects deep-merged,
// scalars overridden by `override`.

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null
  && typeof value === 'object'
  && (Object.getPrototypeOf(value) === Object.prototype
    || Object.getPrototypeOf(value) === null)

export function deepMerge<T>(base: T, override: Partial<T>): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return (override ?? base) as T
  }
  const out: Record<string, unknown> = { ...base }
  for (const key of Object.keys(override)) {
    const a = (base as Record<string, unknown>)[key]
    const b = (override as Record<string, unknown>)[key]
    if (Array.isArray(a) && Array.isArray(b)) {
      out[key] = [...a, ...b]
    } else if (isPlainObject(a) && isPlainObject(b)) {
      out[key] = deepMerge(a, b)
    } else {
      out[key] = b
    }
  }
  return out as T
}
