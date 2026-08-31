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

  test('structured in criterion preserves commas and other string delimiters', () => {
    const values = ['Smith, John', 'quoted "value"', 'path\\segment', '']
    const filter = new Filter({ name: { operator: 'in', values } }, resource)

    expect(filter.get('name')).toMatchObject({ operator: 'in', value: values })
    expect(filter.toJSON()).toEqual({ name: { operator: 'in', values } })
  })

  test('legacy comma-separated in payload remains supported', () => {
    expect(new Filter({ name: 'in:a,b,c' }, resource).get('name')?.value).toEqual(['a', 'b', 'c'])
  })

  test('all strings using the removed in-json prefix remain literal', () => {
    for (const legacy of ['in-json:not-a-json-array', 'in-json:["a"]']) {
      const filter = new Filter({ name: legacy }, resource).get('name')

      expect(filter?.operator).toBeNull()
      expect(filter?.value).toBe(legacy)
    }
  })

  test('supports structured value, range, and nullary criteria', () => {
    const filter = new Filter(
      {
        name: { operator: 'nco', value: 'robot' },
        age: { operator: 'between', from: '18', to: '65' },
        deletedAt: { operator: 'empty' },
      },
      resource,
    )

    expect(filter.get('name')).toMatchObject({ operator: 'nco', value: 'robot' })
    expect(filter.get('age')).toMatchObject({
      operator: 'between',
      value: { from: '18', to: '65' },
    })
    expect(filter.get('deletedAt')).toMatchObject({ operator: 'empty', value: '' })
  })

  test('malformed structured criteria are rejected instead of silently dropped', () => {
    expect(() => new Filter({ name: { operator: 'in', values: 'a,b' } }, resource)).toThrow()
  })
})
