import { describe, expect, test } from 'bun:test'
import { BaseProperty } from '../src/adapters/base-property.js'

describe('BaseProperty', () => {
  test('throws if path is empty', () => {
    expect(() => new BaseProperty({ path: '' })).toThrow()
  })

  test('applies sane defaults', () => {
    const p = new BaseProperty({ path: 'name' })
    expect(p.path()).toBe('name')
    expect(p.type()).toBe('string')
    expect(p.isId()).toBe(false)
    expect(p.isSortable()).toBe(true)
    expect(p.isRequired()).toBe(false)
    expect(p.isArray()).toBe(false)
    expect(p.position()).toBe(1)
    expect(p.reference()).toBeNull()
    expect(p.subProperties()).toEqual([])
  })

  test('isTitle matches well-known column names', () => {
    expect(new BaseProperty({ path: 'title' }).isTitle()).toBe(true)
    expect(new BaseProperty({ path: 'Email' }).isTitle()).toBe(true)
    expect(new BaseProperty({ path: 'foo' }).isTitle()).toBe(false)
  })

  test('isVisible hides password fields by default', () => {
    expect(new BaseProperty({ path: 'password' }).isVisible()).toBe(false)
    expect(new BaseProperty({ path: 'PasswordHash' }).isVisible()).toBe(false)
    expect(new BaseProperty({ path: 'name' }).isVisible()).toBe(true)
  })

  test('isEditable is false for id properties', () => {
    expect(new BaseProperty({ path: 'id', isId: true }).isEditable()).toBe(false)
    expect(new BaseProperty({ path: 'name' }).isEditable()).toBe(true)
  })
})
