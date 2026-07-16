// Minimal dotted-path utilities. Used to flatten/unflatten record params and
// to read nested values by path. Replaces AdminJS' `flat` helper with a much
// smaller, dependency-free implementation tailored to admin-panel needs.

export type FlatParams = Record<string, unknown>

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

export function flatten(value: unknown, prefix = ''): FlatParams {
  const out: FlatParams = {}
  if (isPlainObject(value)) {
    for (const key of Object.keys(value)) {
      const next = prefix ? `${prefix}.${key}` : key
      const child = (value as Record<string, unknown>)[key]
      Object.assign(out, flatten(child, next))
    }
    return out
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      if (prefix) out[prefix] = []
      return out
    }
    value.forEach((item, idx) => {
      const next = prefix ? `${prefix}.${idx}` : String(idx)
      Object.assign(out, flatten(item, next))
    })
    return out
  }
  if (prefix) out[prefix] = value
  return out
}

export function unflatten(flat: FlatParams): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(flat)) {
    setPath(out, key, flat[key])
  }
  return out
}

type Container = Record<string, unknown> | unknown[]

/**
 * Segments that must never be used as object keys during reconstruction.
 * Writing to any of these walks up to `Object.prototype` and lets untrusted
 * input (e.g. query filters like `filters[__proto__][x]=…`) pollute every
 * object in the process. We drop any path containing one of these segments.
 */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.')
  // Reject the entire path if any segment could reach the prototype chain.
  if (parts.some((part) => FORBIDDEN_KEYS.has(part))) return
  let cur: Container = target
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i]!
    const nextPart = parts[i + 1]!
    const nextIsIndex = /^\d+$/.test(nextPart)
    const child: unknown = Array.isArray(cur) ? cur[Number(part)] : cur[part]
    let next: Container
    if (child === undefined) {
      next = nextIsIndex ? [] : {}
      if (Array.isArray(cur)) cur[Number(part)] = next
      else cur[part] = next
    } else {
      next = child as Container
    }
    cur = next
  }
  const last = parts[parts.length - 1]!
  if (Array.isArray(cur)) cur[Number(last)] = value
  else cur[last] = value
}

export function get(
  flat: FlatParams,
  path?: string,
): unknown {
  if (!path) return unflatten(flat)
  if (Object.prototype.hasOwnProperty.call(flat, path)) return flat[path]
  // try to assemble from sub-keys
  const sub: FlatParams = {}
  let hasSub = false
  const prefix = `${path}.`
  for (const key of Object.keys(flat)) {
    if (key.startsWith(prefix)) {
      sub[key.slice(prefix.length)] = flat[key]
      hasSub = true
    }
  }
  if (!hasSub) return undefined
  return unflatten(sub)
}

export function set(flat: FlatParams, path: string, value: unknown): FlatParams {
  // Remove all keys for the path being replaced.
  const next: FlatParams = {}
  const prefix = `${path}.`
  for (const key of Object.keys(flat)) {
    if (key === path || key.startsWith(prefix)) continue
    next[key] = flat[key]
  }
  if (value === undefined) return next
  if (isPlainObject(value) || Array.isArray(value)) {
    Object.assign(next, flatten(value, path))
  } else {
    next[path] = value
  }
  return next
}

export function selectParams(
  flat: FlatParams,
  prefix: string,
): Record<string, unknown> | undefined {
  const sub: FlatParams = {}
  const p = `${prefix}.`
  let any = false
  for (const key of Object.keys(flat)) {
    if (key === prefix || key.startsWith(p)) {
      sub[key] = flat[key]
      any = true
    }
  }
  return any ? sub : undefined
}

export function merge(base: FlatParams, patch: FlatParams | undefined): FlatParams {
  if (!patch) return base
  return { ...base, ...flatten(unflatten(patch as FlatParams)) }
}
