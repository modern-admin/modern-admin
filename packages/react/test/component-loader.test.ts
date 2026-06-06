import { describe, expect, test } from 'bun:test'
import { ComponentLoader } from '../src/component-loader.js'

const Stub = () => null

describe('ComponentLoader', () => {
  test('add + get round-trip', () => {
    const loader = new ComponentLoader()
    loader.add('Custom', Stub)
    expect(loader.get('Custom')).toBe(Stub)
  })

  test('has reflects registration', () => {
    const loader = new ComponentLoader()
    expect(loader.has('X')).toBe(false)
    loader.add('X', Stub)
    expect(loader.has('X')).toBe(true)
  })

  test('list returns registered names', () => {
    const loader = new ComponentLoader()
    loader.add('A', Stub).add('B', Stub)
    expect(loader.list().sort()).toEqual(['A', 'B'])
  })

  test('add overwrites previous registration', () => {
    const loader = new ComponentLoader()
    const A = () => null
    const B = () => null
    loader.add('Same', A)
    loader.add('Same', B)
    expect(loader.get('Same')).toBe(B)
  })

  test('add returns the loader for chaining', () => {
    const loader = new ComponentLoader()
    expect(loader.add('A', Stub)).toBe(loader)
  })
})
