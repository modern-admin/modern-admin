import { describe, expect, test } from 'bun:test'
import { ComponentLoader } from '../src/ports/component-loader.js'

describe('ComponentLoader', () => {
  test('add registers a component once', () => {
    const loader = new ComponentLoader()
    const factory = async () => ({ default: 'X' })
    loader.add('A', factory)
    expect(loader.has('A')).toBe(true)
    expect(loader.get('A')).toBe(factory)
  })

  test('add throws on duplicate registration', () => {
    const loader = new ComponentLoader()
    loader.add('A', async () => ({ default: 1 }))
    expect(() => loader.add('A', async () => ({ default: 2 }))).toThrow()
  })

  test('override replaces an existing entry', () => {
    const loader = new ComponentLoader()
    const original = async () => ({ default: 'orig' })
    const replacement = async () => ({ default: 'new' })
    loader.add('A', original)
    loader.override('A', replacement)
    expect(loader.get('A')).toBe(replacement)
  })

  test('entries lists registered names', () => {
    const loader = new ComponentLoader()
    loader.add('A', async () => ({ default: 1 }))
    loader.add('B', async () => ({ default: 2 }))
    expect(loader.entries().map(([name]) => name).sort()).toEqual(['A', 'B'])
  })
})
