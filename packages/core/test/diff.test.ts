import { describe, expect, it } from 'bun:test'
import {
  computeFieldDiff,
  diffSnapshots,
  omitFields,
  stableStringify,
  uuidv7,
  valuesEqual,
} from '../src/index.js'

describe('stableStringify', () => {
  it('orders object keys deterministically', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }))
  })

  it('handles nested objects and arrays', () => {
    expect(stableStringify({ a: [{ z: 1, a: 2 }] })).toBe('{"a":[{"a":2,"z":1}]}')
  })

  it('serialises primitives', () => {
    expect(stableStringify(null)).toBe('null')
    expect(stableStringify(42)).toBe('42')
    expect(stableStringify('x')).toBe('"x"')
  })
})

describe('valuesEqual', () => {
  it('equates structurally identical values regardless of key order', () => {
    expect(valuesEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true)
  })

  it('distinguishes different values', () => {
    expect(valuesEqual({ a: 1 }, { a: 2 })).toBe(false)
  })
})

describe('computeFieldDiff', () => {
  it('returns added/removed/changed entries sorted by path', () => {
    const diff = computeFieldDiff(
      { name: 'Alice', age: 30 },
      { name: 'Alicia', email: 'a@b' },
    )
    expect(diff).toEqual([
      { path: 'age', before: 30, kind: 'removed' },
      { path: 'email', after: 'a@b', kind: 'added' },
      { path: 'name', before: 'Alice', after: 'Alicia', kind: 'changed' },
    ])
  })

  it('skips excluded fields', () => {
    const diff = computeFieldDiff(
      { name: 'Alice', password: 'secret' },
      { name: 'Alicia', password: 'secret2' },
      new Set(['password']),
    )
    expect(diff).toEqual([
      { path: 'name', before: 'Alice', after: 'Alicia', kind: 'changed' },
    ])
  })

  it('treats structurally equal nested values as unchanged', () => {
    expect(
      computeFieldDiff({ tags: ['a', 'b'] }, { tags: ['a', 'b'] }),
    ).toEqual([])
  })

  it('exposes diffSnapshots as an alias', () => {
    expect(diffSnapshots).toBe(computeFieldDiff)
  })
})

describe('omitFields', () => {
  it('returns a shallow copy without excluded keys', () => {
    expect(omitFields({ a: 1, b: 2, c: 3 }, new Set(['b']))).toEqual({ a: 1, c: 3 })
  })

  it('returns a clone when no keys are excluded', () => {
    const input = { a: 1 }
    const out = omitFields(input, new Set())
    expect(out).toEqual(input)
    expect(out).not.toBe(input)
  })
})

describe('uuidv7', () => {
  it('produces RFC 9562 v7 strings', () => {
    const id = uuidv7()
    // 8-4-4-4-12 hex with version `7` and variant `8|9|a|b`.
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })

  it('is monotonic by timestamp prefix across rapid calls', () => {
    const a = uuidv7()
    const b = uuidv7()
    // Compare the time-ordered prefix (first 12 hex chars = 48 bits of unix-ms).
    expect(b.replaceAll('-', '').slice(0, 12) >= a.replaceAll('-', '').slice(0, 12)).toBe(true)
  })
})
