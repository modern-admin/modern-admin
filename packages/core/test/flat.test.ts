import { describe, expect, test } from 'bun:test'
import { flatten, unflatten, get, set, selectParams, merge } from '../src/utils/flat.js'

describe('flat utilities', () => {
  test('flatten produces dotted-path keys for nested objects', () => {
    expect(flatten({ a: { b: { c: 1 } }, d: 2 })).toEqual({
      'a.b.c': 1,
      d: 2,
    })
  })

  test('flatten flattens arrays using numeric path segments', () => {
    expect(flatten({ tags: ['a', 'b'] })).toEqual({
      'tags.0': 'a',
      'tags.1': 'b',
    })
  })

  test('flatten preserves empty arrays', () => {
    expect(flatten({ tags: [] })).toEqual({ tags: [] })
  })

  test('unflatten round-trips flatten()', () => {
    const original = { user: { name: 'Ann', tags: ['a', 'b'] }, age: 5 }
    expect(unflatten(flatten(original))).toEqual(original)
  })

  test('get returns whole object when path is undefined', () => {
    const flat = { 'a.b': 1, 'a.c': 2 }
    expect(get(flat)).toEqual({ a: { b: 1, c: 2 } })
  })

  test('get supports both direct and prefix lookups', () => {
    const flat = { 'a.b': 1, 'a.c': 2, x: 'y' }
    expect(get(flat, 'a.b')).toBe(1)
    expect(get(flat, 'a')).toEqual({ b: 1, c: 2 })
    expect(get(flat, 'missing')).toBeUndefined()
  })

  test('set replaces existing scalar', () => {
    const flat = { a: 1 }
    expect(set(flat, 'a', 2)).toEqual({ a: 2 })
  })

  test('set replaces a whole subtree, removing stale sub-keys', () => {
    const flat = { 'user.name': 'old', 'user.age': 7 }
    expect(set(flat, 'user', { name: 'new' })).toEqual({ 'user.name': 'new' })
  })

  test('set with undefined removes the path', () => {
    const flat = { 'a.b': 1, c: 2 }
    expect(set(flat, 'a.b', undefined)).toEqual({ c: 2 })
  })

  test('selectParams returns sub-keys under a prefix', () => {
    const flat = { 'a.b': 1, 'a.c': 2, d: 3 }
    expect(selectParams(flat, 'a')).toEqual({ 'a.b': 1, 'a.c': 2 })
    expect(selectParams(flat, 'missing')).toBeUndefined()
  })

  test('merge overlays patch onto base', () => {
    expect(merge({ a: 1, b: 2 }, { b: 3, c: 4 })).toEqual({ a: 1, b: 3, c: 4 })
  })

  test('merge with undefined patch returns base', () => {
    expect(merge({ a: 1 }, undefined)).toEqual({ a: 1 })
  })
})
