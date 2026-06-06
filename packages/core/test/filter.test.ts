import { describe, expect, test } from 'bun:test'
import { Filter } from '../src/filter/filter.js'
import { FakeResource } from './_helpers/fake-adapter.js'

const resource = new FakeResource({ name: 'users', rows: [] })

describe('Filter', () => {
  test('empty filter has no visible elements', () => {
    const f = new Filter(undefined, resource)
    expect(f.isVisible()).toBe(false)
    expect(f.toJSON()).toEqual({})
  })

  test('flat scalar filters resolve to FilterElements with property lookup', () => {
    const f = new Filter({ name: 'Ann' }, resource)
    const el = f.get('name')
    expect(el).not.toBeNull()
    expect(el!.value).toBe('Ann')
    expect(el!.property?.path()).toBe('name')
  })

  test('range qualifier ~~from / ~~to is collapsed into one element', () => {
    const f = new Filter(
      { 'createdAt~~from': '2025-01-01', 'createdAt~~to': '2025-12-31' },
      resource,
    )
    const el = f.get('createdAt')
    expect(el).not.toBeNull()
    expect(el!.value).toEqual({ from: '2025-01-01', to: '2025-12-31' })
  })

  test('reduce iterates over filter elements', () => {
    const f = new Filter({ name: 'A', id: '1' }, resource)
    const paths = f.reduce<string[]>((acc, el) => [...acc, el.path], [])
    expect(paths.sort()).toEqual(['id', 'name'])
  })
})
